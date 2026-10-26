import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { BarScene, EngravedEvent, System } from "@/modules/engraving";
import { isWithinOctaveRange, movePitch, type Pitch, type Score } from "@/modules/score";
import { clampMeasureWidth, measureWidth } from "../../application/bar-spacing";
import type { GesturePreview } from "../../application/gesture-preview";
import type { CommitEdit } from "./use-score-editor";

/** Pointer travel (scene units) before a drag commits to an axis. */
const AXIS_LOCK_DISTANCE = 4;
/** Scene units per diatonic step when dragging vertically. */
const PITCH_DRAG_STEP = 6;

type NoteDrag = {
  kind: "note";
  id: string;
  measureId: string;
  startX: number;
  startY: number;
  pitch: Pitch | null;
  delta: number;
  axis: "x" | "y" | null;
  beforeId: string | null;
  originalBeforeId: string | null;
  /** Other events in the bar, for finding the drop position. */
  positions: { id: string; x: number }[];
  revision: number;
};
type BarDrag = { kind: "bar"; id: string; startX: number; width: number; nextWidth: number; revision: number };

type Options = {
  svgRef: RefObject<SVGSVGElement | null>;
  score: Score;
  interactive: boolean;
  onCommand: CommitEdit;
  onSelect: (id: string | null) => void;
  closeContextMenu: () => void;
};

/**
 * Pointer gestures on the sheet. Vertical note drags change pitch, horizontal drags reorder
 * within the bar, and the internal barline adjusts spacing. While dragging only a preview
 * changes; releasing commits exactly one revision-checked edit. Escape or window blur cancels.
 */
export function useSheetGestures({ svgRef, score, interactive, onCommand, onSelect, closeContextMenu }: Options) {
  const drag = useRef<NoteDrag | BarDrag | null>(null);
  const [preview, setPreview] = useState<GesturePreview | null>(null);

  const cancelGesture = useCallback(() => {
    drag.current = null;
    setPreview(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelGesture();
      closeContextMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", cancelGesture);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", cancelGesture);
    };
  }, [cancelGesture, closeContextMenu]);

  /** Converts client coordinates into scene units, accounting for zoom. */
  const scenePoint = (clientX: number, clientY: number) => {
    const matrix = svgRef.current?.getScreenCTM();
    const point = new DOMPoint(clientX, clientY);
    return matrix ? point.matrixTransform(matrix.inverse()) : point;
  };

  const capturePointer = (event: PointerEvent<SVGGElement>) => {
    closeContextMenu();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startNoteDrag = (event: PointerEvent<SVGGElement>, item: EngravedEvent, system: System) => {
    if (!interactive || event.button !== 0) return;
    const id = item.event.id;
    capturePointer(event);
    onSelect(id);
    const point = scenePoint(event.clientX, event.clientY);
    const measure = score.measures[item.measure];
    const beforeId = measure.events[measure.events.findIndex((e) => e.id === id) + 1]?.id ?? null;
    drag.current = {
      kind: "note",
      id,
      measureId: measure.id,
      startX: point.x,
      startY: point.y,
      pitch: item.event.pitch,
      delta: 0,
      axis: null,
      beforeId,
      originalBeforeId: beforeId,
      positions: system.events
        .filter((other) => other.measure === item.measure && other.event.id !== id)
        .map((other) => ({ id: other.event.id, x: other.x })),
      revision: score.revision,
    };
  };

  const moveNoteDrag = (event: PointerEvent<SVGGElement>, eventId: string) => {
    const gesture = drag.current;
    if (gesture?.kind !== "note" || gesture.id !== eventId) return;
    const point = scenePoint(event.clientX, event.clientY);
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;
    if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > AXIS_LOCK_DISTANCE) {
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (gesture.axis === "y" && gesture.pitch) {
      const delta = Math.round(-dy / PITCH_DRAG_STEP);
      if (!isWithinOctaveRange(movePitch(gesture.pitch, delta))) return;
      gesture.delta = delta;
      setPreview({ kind: "pitch", id: eventId, delta });
    } else if (gesture.axis === "x") {
      gesture.beforeId = gesture.positions.find((other) => point.x < other.x)?.id ?? null;
      setPreview({ kind: "order", id: eventId, measureId: gesture.measureId, beforeId: gesture.beforeId });
    }
  };

  /** Only the first bar of a two-bar system has a draggable divider. */
  const startBarDrag = (event: PointerEvent<SVGGElement>, bar: BarScene) => {
    if (!interactive || event.button !== 0) return;
    capturePointer(event);
    const width = measureWidth(score.measures[bar.number - 1]);
    const startX = scenePoint(event.clientX, event.clientY).x;
    drag.current = { kind: "bar", id: bar.id, width, nextWidth: width, startX, revision: score.revision };
  };

  const moveBarDrag = (event: PointerEvent<SVGGElement>, barId: string) => {
    const gesture = drag.current;
    if (gesture?.kind !== "bar" || gesture.id !== barId) return;
    const x = scenePoint(event.clientX, event.clientY).x;
    gesture.nextWidth = clampMeasureWidth(Math.round(gesture.width + x - gesture.startX));
    setPreview({ kind: "width", id: barId, width: gesture.nextWidth });
  };

  const finishGesture = () => {
    const gesture = drag.current;
    if (gesture?.kind === "bar" && gesture.width !== gesture.nextWidth) {
      const operation = { type: "setMeasureWidth", measureId: gesture.id, width: gesture.nextWidth } as const;
      onCommand(operation, "Adjusted bar spacing", gesture.revision);
    }
    if (gesture?.kind === "note") {
      if (gesture.axis === "y" && gesture.delta && gesture.pitch) {
        const pitch = movePitch(gesture.pitch, gesture.delta);
        onCommand({ type: "setPitch", eventId: gesture.id, pitch }, "Moved note pitch", gesture.revision);
      }
      if (gesture.axis === "x" && gesture.beforeId !== gesture.originalBeforeId) {
        const operation = { type: "moveEvent", eventId: gesture.id, beforeEventId: gesture.beforeId } as const;
        onCommand(operation, "Moved note within bar", gesture.revision);
      }
    }
    cancelGesture();
  };

  return { preview, cancelGesture, startNoteDrag, moveNoteDrag, startBarDrag, moveBarDrag, finishGesture };
}
