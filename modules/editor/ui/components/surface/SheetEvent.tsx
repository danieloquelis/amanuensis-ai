import type { CSSProperties } from "react";
import { staffOf, staffTop, type EngravedEvent, type System } from "@/modules/engraving";
import { EventGlyph } from "@/modules/engraving/ui";
import { drumNames, eventPitches, pitchName, soundingBeats, type Pitch } from "@/modules/score";
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
  /** Just arrived from the assistant: pops in after this many ms. */
  arrival?: number;
};

/** "C4", or a chord's notes "C4, E4 and G4"; "Rest" for none. */
const notesName = (pitches: Pitch[]) =>
  pitches.length
    ? pitches
        .map(pitchName)
        .join(", ")
        .replace(/, ([^,]+)$/, " and $1")
    : "Rest";

/** The notes as the sheet shows them (a drum hit's pieces), with their sound when written transposed and a range warning. */
function pitchLabel({ event, sounds, outOfRange }: EngravedEvent) {
  if (event.drums) return drumNames(event.drums).replace(/^./, (c) => c.toUpperCase());
  const shown = notesName(eventPitches(event)) + (sounds ? ` (sounds ${notesName(sounds)})` : "");
  return outOfRange ? `${shown}, out of range` : shown;
}

/**
 * A selectable, draggable note or rest; Shift/⌘-click adds it to the selection. A press on one head
 * of a chord or drum hit picks that head alone. Keyboard: ↑/↓ step the pitch, A–G enter a note
 * (Shift+A–G adds it to the chord), Delete turns a note into a rest (a picked head comes off its
 * stem), S slurs, Space or Enter selects it.
 */
export function SheetEvent({ item, system, partName, selected, playBeat, interactions, arrival }: SheetEventProps) {
  const { select, stepPitch, removeEvent, enterLetter, gestures, pick, focusEvent } = interactions;
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
        arrival !== undefined && styles.arriving,
      )}
      style={arrival !== undefined ? ({ "--arrive-delay": `${arrival}ms` } as CSSProperties) : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${partName ? `${partName}, bar` : "Bar"} ${item.measure + 1}, beat ${item.localBeat + 1}, ${item.voice > 1 ? `voice ${item.voice}, ` : ""}${pitchLabel(item)}, ${length} beats`}
      aria-pressed={selected}
      onFocus={() => focusEvent(event.id)}
      // A Shift/⌘ click adds to the selection without moving focus (which would select only this).
      onMouseDown={(e) => {
        if (pickModeOf(e)) e.preventDefault();
      }}
      // A right-click selects the note, like a click: its actions are in the selection card.
      onContextMenu={(e) => {
        e.preventDefault();
        select(event.id);
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
        if (e.key === " " || isMenuKey(e)) {
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
        {selected && <Halo item={item} head={interactions.pickedHead(event.id)} />}
        <EventGlyph
          item={item}
          systemTop={staffTop(system, staffOf(item))}
          beamed={system.beamedIds.includes(event.id)}
        />
      </g>
    </g>
  );
}

/** The selection halo: round the whole stem, or round the one head picked on it. */
function Halo({ item, head }: { item: EngravedEvent; head: number | null }) {
  const picked = head !== null ? item.heads?.[head] : undefined;
  if (picked) return <ellipse className={styles.halo} cx={item.x + picked.dx} cy={picked.y} rx="13" ry="10" />;
  // A stem of several notes glows round all of them.
  const top = Math.min(item.y, ...(item.heads?.map((h) => h.y) ?? []));
  const spread = item.y - top;
  return <ellipse className={styles.halo} cx={item.x} cy={(item.y + top) / 2} rx="18" ry={15 + spread / 2} />;
}
