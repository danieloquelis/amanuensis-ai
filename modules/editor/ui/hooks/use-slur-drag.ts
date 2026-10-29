import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";
import { SLUR_LIFT, type Score } from "@/modules/score";
import type { GesturePreview } from "../../application/gesture-preview";
import type { CommitEdit } from "./use-score-editor";

/** Pointer travel (scene units) before a press becomes a drag, so a click still just selects. */
const DRAG_THRESHOLD = 4;
/** How far ↑/↓ move a selected slur's middle, in scene units. */
export const SLUR_NUDGE = 4;

type SlurDrag = { id: string; startY: number; origin: number; above: boolean; lift: number | null; revision: number };

const clampLift = (lift: number) => Math.round(Math.max(SLUR_LIFT.min, Math.min(SLUR_LIFT.max, lift)));

/**
 * Reshapes a slur by dragging it: the arc's middle follows the pointer up or down, rounder away
 * from the notes and flatter toward them. Only a preview changes until release, which commits one
 * revision-checked `shapeSlur`.
 */
export function useSlurDrag(svgRef: RefObject<SVGSVGElement | null>, score: Score, onCommand: CommitEdit) {
  const drag = useRef<SlurDrag | null>(null);
  const [preview, setPreview] = useState<GesturePreview | null>(null);

  const sceneY = (clientX: number, clientY: number) => {
    const matrix = svgRef.current?.getScreenCTM();
    const point = new DOMPoint(clientX, clientY);
    return (matrix ? point.matrixTransform(matrix.inverse()) : point).y;
  };

  const cancel = useCallback(() => {
    drag.current = null;
    setPreview(null);
  }, []);

  const start = (event: PointerEvent<SVGElement>, slurId: string, above: boolean) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = score.slurs.find((s) => s.id === slurId)?.lift ?? 0;
    const startY = sceneY(event.clientX, event.clientY);
    drag.current = { id: slurId, startY, origin, above, lift: null, revision: score.revision };
  };

  const move = (event: PointerEvent<SVGElement>) => {
    const gesture = drag.current;
    if (!gesture) return;
    const dy = sceneY(event.clientX, event.clientY) - gesture.startY;
    if (gesture.lift === null && Math.abs(dy) <= DRAG_THRESHOLD) return;
    gesture.lift = clampLift(gesture.origin + (gesture.above ? -dy : dy));
    setPreview({ kind: "slur", id: gesture.id, lift: gesture.lift });
  };

  const finish = () => {
    const gesture = drag.current;
    if (gesture?.lift != null && gesture.lift !== gesture.origin) {
      onCommand({ type: "shapeSlur", id: gesture.id, lift: gesture.lift }, "Reshaped slur", gesture.revision);
    }
    cancel();
  };

  /** ↑/↓ on a selected slur: its middle moves that way by one nudge. */
  const nudge = (slurId: string, above: boolean, up: boolean) => {
    const lift = score.slurs.find((s) => s.id === slurId)?.lift ?? 0;
    const next = clampLift(lift + (up === above ? SLUR_NUDGE : -SLUR_NUDGE));
    if (next !== lift) onCommand({ type: "shapeSlur", id: slurId, lift: next }, "Reshaped slur");
  };

  return { preview, start, move, finish, cancel, nudge };
}
