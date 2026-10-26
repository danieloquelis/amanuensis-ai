import { STAFF_LINES_X, type EngravedEvent, type System } from "@/modules/engraving";
import { DurationButtons } from "../sheet-menu/DurationButtons";
import styles from "./score-surface.module.css";
import type { SheetInteractions } from "./sheet-interactions";

const TOOLBAR = { width: 232, height: 44, maxX: 620, offsetX: 98, minOffsetY: 78, gapBelowNote: 23 };

/** Floating duration strip under the selected note; "···" opens the full note menu. */
export function SelectedNoteToolbar({
  item,
  system,
  interactions,
}: {
  item: EngravedEvent;
  system: System;
  interactions: SheetInteractions;
}) {
  const x = Math.max(STAFF_LINES_X.start, Math.min(TOOLBAR.maxX, item.x - TOOLBAR.offsetX));
  const y = Math.max(system.top + TOOLBAR.minOffsetY, item.y + TOOLBAR.gapBelowNote);
  return (
    <foreignObject x={x} y={y} width={TOOLBAR.width} height={TOOLBAR.height} className={styles.quickActions}>
      <div
        className={styles.quickBar}
        role="toolbar"
        aria-label="Selected note actions"
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          interactions.select(null);
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DurationButtons event={item.event} onCommand={interactions.commit} />
        <button
          aria-label="More note actions"
          title="More · right-click note"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            interactions.openMenu("note", item.event.id, rect.left, rect.bottom + 4);
          }}
        >
          ···
        </button>
      </div>
    </foreignObject>
  );
}
