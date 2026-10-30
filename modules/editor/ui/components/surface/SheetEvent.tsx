import { staffOf, staffTop, type EngravedEvent, type System } from "@/modules/engraving";
import { EventGlyph } from "@/modules/engraving/ui";
import { eventPitches, pitchName, soundingBeats, type Pitch } from "@/modules/score";
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
  /** Its part, named first in its label when the score has several. */
  partName?: string;
  selected: boolean;
  playBeat: number | null;
  interactions: SheetInteractions;
};

/** "C4", or a chord's notes "C4, E4 and G4"; "Rest" for none. */
const notesName = (pitches: Pitch[]) =>
  pitches.length
    ? pitches
        .map(pitchName)
        .join(", ")
        .replace(/, ([^,]+)$/, " and $1")
    : "Rest";

/** The notes as the sheet shows them, with their sound when written transposed and a range warning. */
function pitchLabel({ event, sounds, outOfRange }: EngravedEvent) {
  const shown = notesName(eventPitches(event)) + (sounds ? ` (sounds ${notesName(sounds)})` : "");
  return outOfRange ? `${shown}, out of range` : shown;
}

/**
 * A selectable, draggable note or rest; Shift/⌘-click adds it to the selection. Keyboard: ↑/↓ step the pitch, A–G enter a note (Shift+A–G adds it to the chord),
 * Delete turns a note into a rest, S slurs, Enter opens its menu.
 */
export function SheetEvent({ item, system, partName, selected, playBeat, interactions }: SheetEventProps) {
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
      aria-label={`${partName ? `${partName}, bar` : "Bar"} ${item.measure + 1}, beat ${item.localBeat + 1}, ${item.voice > 1 ? `voice ${item.voice}, ` : ""}${pitchLabel(item)}, ${length} beats`}
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
          enterLetter(event.id, letter, e.shiftKey);
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
      {/* The whole chord is the target: any of its notes can be grabbed. */}
      <rect
        className={styles.hit}
        x={x - 13}
        y={(item.chordTop ?? y) - 22}
        width="26"
        height={y - (item.chordTop ?? y) + 44}
        rx="7"
      />
      <g pointerEvents="none">
        {selected && <ellipse className={styles.halo} cx={x} cy={y} rx="18" ry="15" />}
        <EventGlyph
          item={item}
          systemTop={staffTop(system, staffOf(item))}
          beamed={system.beamedIds.includes(event.id)}
        />
      </g>
    </g>
  );
}
