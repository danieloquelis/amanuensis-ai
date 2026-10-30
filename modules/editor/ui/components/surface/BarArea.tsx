import type { KeyboardEvent } from "react";
import { STAFF_GAP, type BarScene } from "@/modules/engraving";
import { barRef } from "../../../application/sheet-selection";
import styles from "./score-surface.module.css";
import { pickModeOf, sheetRefAttribute, type SheetInteractions } from "./sheet-interactions";

const STAFF_HEIGHT = STAFF_GAP * 4;
/** The area reaches this far above and below its staff. */
const MARGIN = 22;

type BarAreaProps = {
  bar: BarScene;
  /** The staff's top line; `bottom` is the lowest staff line it covers (its own by default). */
  top: number;
  bottom?: number;
  /** With several staves: the lane's staff, and its name for the label. */
  staffId?: string;
  laneName?: string;
  interactions: SheetInteractions;
};

/**
 * A bar's empty staff area: click to select the bar (Shift/⌘ adds it to the selection), Delete
 * removes it, Escape deselects. With several staves each staff has its own area, which selects
 * the bar in that instrument's lane only (Delete then clears it there); a whole bar picked by its
 * number lights every lane. Drawn beneath all barlines and notes so those stay clickable.
 */
export function BarArea({ bar, top, bottom = top + STAFF_HEIGHT, staffId, laneName, interactions }: BarAreaProps) {
  const { selectBar, deleteBar, isPicked, pick } = interactions;
  const ref = barRef(bar.id, staffId);
  const selected = isPicked(ref) || (staffId !== undefined && isPicked(barRef(bar.id)));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteBar(bar.id, staffId);
    }
    if (e.key === "Escape") selectBar(null);
  };
  return (
    <rect
      {...sheetRefAttribute(ref)}
      className={selected ? styles.barSelected : styles.barArea}
      x={bar.x}
      y={top - MARGIN}
      width={bar.width}
      height={bottom - top + 2 * MARGIN}
      role="button"
      tabIndex={0}
      aria-label={laneName ? `Bar ${bar.number}, ${laneName}` : `Bar ${bar.number}`}
      aria-pressed={selected}
      onMouseDown={(e) => {
        if (pickModeOf(e)) e.preventDefault();
      }}
      onClick={(e) => {
        const mode = pickModeOf(e);
        if (mode) return pick(ref, mode);
        selectBar(bar.id, staffId);
        e.currentTarget.focus();
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        selectBar(bar.id, staffId);
      }}
    />
  );
}
