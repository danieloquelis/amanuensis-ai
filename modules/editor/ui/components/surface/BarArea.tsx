import type { KeyboardEvent } from "react";
import { STAFF_GAP, type BarScene, type System } from "@/modules/engraving";
import styles from "./score-surface.module.css";
import type { SheetInteractions } from "./sheet-interactions";

const STAFF_HEIGHT = STAFF_GAP * 4;

/**
 * A bar's empty staff area: click to select the whole bar, Delete removes it, Escape deselects.
 * Drawn beneath all barlines and notes so those stay clickable.
 */
export function BarArea({
  bar,
  system,
  interactions,
}: {
  bar: BarScene;
  system: System;
  interactions: SheetInteractions;
}) {
  const { selectBar, deleteBar, selectedBarId } = interactions;
  const selected = selectedBarId === bar.id;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteBar(bar.id);
    }
    if (e.key === "Escape") selectBar(null);
  };
  return (
    <rect
      className={selected ? styles.barSelected : styles.barArea}
      x={bar.x}
      y={system.top - 22}
      width={bar.width}
      height={STAFF_HEIGHT + 44}
      role="button"
      tabIndex={0}
      aria-label={`Bar ${bar.number}`}
      aria-pressed={selected}
      onClick={(e) => {
        selectBar(bar.id);
        e.currentTarget.focus();
      }}
      onKeyDown={onKeyDown}
    />
  );
}
