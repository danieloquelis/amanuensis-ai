import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutScore } from "@/modules/engraving";
import { everyEvent, meterName, type Score, type Step } from "@/modules/score";
import { applyGesturePreview } from "../../../application/gesture-preview";
import { slurKeyEdit } from "../../../application/range-edits";
import { eventPartNames, laneNames, sheetHeading } from "../../../application/sheet-view";
import type { SheetItem } from "../../../application/notation-edits";
import { sameRef, type PickMode, type SheetRef } from "../../../application/sheet-selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { useSheetGestures } from "../../hooks/use-sheet-gestures";
import { useSlurDrag } from "../../hooks/use-slur-drag";
import { SheetContextMenu } from "../sheet-menu/SheetContextMenu";
import styles from "./score-surface.module.css";
import type { SheetInteractions, SheetMenuTarget } from "./sheet-interactions";
import { SheetSystem } from "./SheetSystem";

type ScoreSurfaceProps = {
  score: Score;
  playBeat: number | null;
  interactive: boolean;
  /** Selects a note or rest; with `head`, one head of its stem (a note of a chord, a drum piece). */
  onSelect: (id: string | null, head?: number) => void;
  selectedBarId: string | null;
  onSelectBar: (measureId: string | null, staffId?: string) => void;
  onDeleteBar: (measureId: string, staffId?: string) => void;
  selectedItem: SheetItem | null;
  onSelectItem: (item: SheetItem | null) => void;
  onDeleteItem: (item: SheetItem) => void;
  onCommand: CommitEdit;
  onStep: (id: string, steps: number) => void;
  onDelete: (id: string) => void;
  onEnterLetter: (id: string, step: Step, addToChord: boolean) => void;
  onToggleRest: (id: string) => void;
  /** Everything picked, for highlighting; `onPick` handles Shift/⌘ clicks. */
  picked: SheetRef[];
  onPick: (ref: SheetRef, mode: PickMode) => void;
  onFocusEvent: (id: string) => void;
  /** Told when a context menu opens or closes, so other floating panels can step aside. */
  onMenuOpenChange?: (open: boolean) => void;
  /** Sounds a note that is pressed or dragged to a new pitch. */
  /** Sounds a note as a MIDI note (a pitch, or a drum piece). */
  onAudition?: (eventId: string, midi: number) => void;
};

/** The editable sheet: engraved score plus selection, drag gestures and context menus. */
export function ScoreSurface({
  score,
  playBeat,
  interactive,
  onSelect,
  selectedBarId,
  onSelectBar,
  onDeleteBar,
  selectedItem,
  onSelectItem,
  onDeleteItem,
  onCommand,
  onStep,
  onDelete,
  onEnterLetter,
  onToggleRest,
  picked,
  onPick,
  onFocusEvent,
  onMenuOpenChange,
  onAudition,
}: ScoreSurfaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [menu, setMenu] = useState<SheetMenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuOpen = menu !== null;
  useEffect(() => onMenuOpenChange?.(menuOpen), [menuOpen, onMenuOpenChange]);
  const gestures = useSheetGestures({
    svgRef,
    score,
    interactive,
    onCommand,
    onSelect,
    closeContextMenu: closeMenu,
    onAudition,
  });

  const slurGestures = useSlurDrag(svgRef, score, onCommand);

  const interactions: SheetInteractions = {
    interactive,
    select: onSelect,
    selectedBarId,
    selectBar: onSelectBar,
    deleteBar: onDeleteBar,
    selectedItem,
    selectItem: onSelectItem,
    deleteItem: onDeleteItem,
    commit: onCommand,
    stepPitch: onStep,
    removeEvent: onDelete,
    enterLetter: onEnterLetter,
    toggleRest: onToggleRest,
    slur: (eventId) => {
      const edit = slurKeyEdit(score, picked, eventId);
      if (edit) onCommand(edit.operation, edit.receipt);
    },
    isPicked: (ref) => picked.some((p) => sameRef(p, ref)),
    pickedHead: (eventId) => {
      const ref = picked.find((p) => p.kind === "event" && p.id === eventId);
      return ref?.kind === "event" ? (ref.head ?? null) : null;
    },
    multiple: picked.length > 1,
    pick: onPick,
    focusEvent: onFocusEvent,
    gestures,
    slurGestures,
    openMenu: (kind, id, x, y) => {
      if (!interactive) return;
      gestures.cancelGesture();
      setMenu({ kind, id, x, y });
    },
  };

  // Layout is the costly step with many parts: it runs again only when the score or a preview changes.
  const preview = slurGestures.preview ?? gestures.preview;
  const scene = useMemo(() => layoutScore(applyGesturePreview(score, preview)), [score, preview]);
  // Keep DOM nodes in score order while a drag previews new positions, so pointer capture holds.
  const eventOrder = useMemo(() => new Map(everyEvent(score).map((event, index) => [event.id, index])), [score]);
  const partNames = useMemo(() => eventPartNames(score), [score]);
  const lanes = useMemo(() => laneNames(score), [score]);
  const meters = score.measures.map((m) => meterName(m.meter)).join(", ");

  return (
    <div className={styles.sheet}>
      <svg
        ref={svgRef}
        className={styles.surface}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        aria-label={`${score.title}, ${sheetHeading(score)}, ${meters} meter. Select a note to edit.`}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          onSelect(null);
          onSelectBar(null);
          onSelectItem(null);
          closeMenu();
        }}
      >
        {scene.systems.map((system) => (
          <SheetSystem
            key={system.firstMeasure}
            system={system}
            eventOrder={eventOrder}
            partNames={partNames}
            laneNames={lanes}
            playBeat={playBeat}
            interactions={interactions}
          />
        ))}
      </svg>
      {menu && (
        <SheetContextMenu
          key={`${menu.kind}-${menu.id}`}
          target={menu}
          score={score}
          onCommand={onCommand}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
