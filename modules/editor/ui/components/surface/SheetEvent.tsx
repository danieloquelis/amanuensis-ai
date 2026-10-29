import type { EngravedEvent, System } from "@/modules/engraving";
import { EventGlyph } from "@/modules/engraving/ui";
import { pitchName, soundingBeats } from "@/modules/score";
import { classNames } from "@/shared/ui/class-names";
import styles from "./score-surface.module.css";
import {
  isMenuKey,
  isSlurKey,
  noteLetterOf,
  pickModeOf,
  sheetRefAttribute,
  type SheetInteractions,
} from "./sheet-interactions";

type SheetEventProps = {
  item: EngravedEvent;
  system: System;
  selected: boolean;
  playBeat: number | null;
  interactions: SheetInteractions;
};

/** The pitch as the sheet shows it, with its sound when written transposed and a range warning. */
function pitchLabel({ event, sounds, outOfRange }: EngravedEvent) {
  const shown = pitchName(event.pitch) + (sounds ? ` (sounds ${pitchName(sounds)})` : "");
  return outOfRange ? `${shown}, out of range` : shown;
}

/**
 * A selectable, draggable note or rest; Shift/⌘-click adds it to the selection. Keyboard: ↑/↓ step the pitch, A–G enter a note,
 * Delete turns a note into a rest, S slurs, Enter opens its menu.
 */
export function SheetEvent({ item, system, selected, playBeat, interactions }: SheetEventProps) {
  const { select, stepPitch, removeEvent, enterLetter, openMenu, gestures, pick, focusEvent } = interactions;
  const { event, x, y } = item;
  const length = soundingBeats(event);
  const sounding = playBeat !== null && playBeat >= item.beat && playBeat < item.beat + length;

  return (
    <g
      {...sheetRefAttribute({ kind: "event", id: event.id })}
      className={classNames(
        styles.event,
        item.outOfRange && styles.outOfRange,
        selected && styles.selected,
        sounding && styles.sounding,
      )}
      role="button"
      tabIndex={0}
      aria-label={`Bar ${item.measure + 1}, beat ${item.localBeat + 1}, ${pitchLabel(item)}, ${length} beats`}
      aria-pressed={selected}
      onFocus={() => focusEvent(event.id)}
      // A Shift/⌘ click adds to the selection without moving focus (which would select only this).
      onMouseDown={(e) => {
        if (pickModeOf(e)) e.preventDefault();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        select(event.id);
        openMenu("note", event.id, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          stepPitch(event.id, e.key === "ArrowUp" ? 1 : -1);
        }
        const letter = noteLetterOf(e);
        if (letter) {
          e.preventDefault();
          enterLetter(event.id, letter);
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          removeEvent(event.id);
        }
        if (isSlurKey(e)) {
          e.preventDefault();
          interactions.slur(event.id);
        }
        if (isMenuKey(e)) {
          e.preventDefault();
          select(event.id);
          const rect = e.currentTarget.getBoundingClientRect();
          openMenu("note", event.id, rect.right, rect.top);
        }
        if (e.key === " ") {
          e.preventDefault();
          select(event.id);
        }
        if (e.key === "Escape") {
          select(null);
          gestures.cancelGesture();
        }
      }}
      onPointerDown={(e) => {
        const mode = pickModeOf(e);
        if (!mode) return gestures.startNoteDrag(e, item, system);
        e.preventDefault();
        pick({ kind: "event", id: event.id }, mode);
      }}
      onPointerMove={(e) => gestures.moveNoteDrag(e, event.id)}
      onPointerUp={gestures.finishGesture}
      onPointerCancel={gestures.cancelGesture}
    >
      <rect className={styles.hit} x={x - 13} y={y - 22} width="26" height="44" rx="7" />
      <g pointerEvents="none">
        {selected && <ellipse className={styles.halo} cx={x} cy={y} rx="18" ry="15" />}
        <EventGlyph item={item} systemTop={system.top} beamed={system.beamedIds.includes(event.id)} />
      </g>
    </g>
  );
}
