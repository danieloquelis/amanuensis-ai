import { STAFF_LEFT, type EngravedEvent, type System } from "@/modules/engraving";
import { DurationButtons } from "../sheet-menu/DurationButtons";
import styles from "./score-surface.module.css";
import type { SheetInteractions } from "./sheet-interactions";

const TOOLBAR = { width: 262, height: 44, maxX: 620, offsetX: 98, minOffsetY: 78, gapBelowNote: 23 };

/**
 * Floating strip under the selected note or rest: durations, a note/rest toggle, and "···" for
 * the full menu.
 */
export function SelectedNoteToolbar({
  item,
  system,
  interactions,
}: {
  item: EngravedEvent;
  system: System;
  interactions: SheetInteractions;
}) {
  const x = Math.max(STAFF_LEFT, Math.min(TOOLBAR.maxX, item.x - TOOLBAR.offsetX));
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
          aria-label={item.event.pitch ? "Make rest" : "Add note"}
          title={item.event.pitch ? "Make rest · Delete" : "Add note · or type A–G"}
          onClick={() => interactions.toggleRest(item.event.id)}
        >
          {item.event.pitch ? <RestIcon /> : <NoteIcon />}
        </button>
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

function NoteIcon() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="20" aria-hidden="true">
      <ellipse cx="8" cy="18" rx="5" ry="3.5" transform="rotate(-20 8 18)" fill="currentColor" />
      <path d="M12.5 17V3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RestIcon() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="20" aria-hidden="true">
      <path d="M 8 2 L 13 7 L 10 12 L 13 17 Q 6 14 10 22 Q 3 17 8 15 L 5 11 L 8 6 Z" fill="currentColor" />
    </svg>
  );
}
