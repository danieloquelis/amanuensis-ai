import { formatChord, isNote, type Score } from "@/modules/score";
import { beatX, type EngravedEvent, type System } from "./scene";

/** Space between the topmost ink and the chord row, and between rows. */
const CHORD_CLEARANCE = 10;
const ROW_GAP = 22;
const CHORD_NUDGE_LEFT = 4;
/** Text sizes above the staff, to estimate how far up a system reaches. */
const ROW_TEXT_HEIGHT = 16;
const BAR_NUMBER_TOP = 44;

/** Highest ink of one event: notehead, up-stem, or articulation. */
function eventTop(item: EngravedEvent, systemTop: number): number {
  if (item.hidden) return systemTop;
  const head = item.y - 8;
  const stem = isNote(item.event) && !item.stemDown ? item.stemEnd : head;
  const articulation = item.event.articulation ? Math.min(item.y - 18, systemTop - 12) - 6 : head;
  return Math.min(head, stem, articulation);
}

/**
 * Stacks the rows above a staff: chord symbols just clear of the highest note, stem or beam,
 * then marks (sections, segno/coda, tempo, D.C./D.S.) above the chords.
 */
export function placeAboveStaff(system: System, score: Score): void {
  const beamTops = system.beams.filter((b) => !b.down).map((b) => Math.min(b.y1, b.y2));
  const inkTop = Math.min(system.top, ...system.events.map((e) => eventTop(e, system.top)), ...beamTops);
  system.chordY = Math.min(system.top - 14, inkTop - CHORD_CLEARANCE);
  system.chords = system.bars.flatMap((bar) =>
    score.chords
      .filter((chord) => chord.measureId === bar.id)
      .map((chord) => ({
        id: chord.id,
        x: beatX(bar, bar.beat + chord.beat) - CHORD_NUDGE_LEFT,
        text: formatChord(chord),
      })),
  );
  system.markY = system.chords.length ? system.chordY - ROW_GAP : system.chordY;
}

/** The highest point anything in the system reaches, to keep clear of the system above. */
export function systemCeiling(system: System): number {
  const hasMarks = system.bars.some((b) => b.section || b.marks.length || b.tempo);
  return Math.min(
    system.top - BAR_NUMBER_TOP,
    system.chords.length ? system.chordY - ROW_TEXT_HEIGHT : Infinity,
    hasMarks ? system.markY - ROW_TEXT_HEIGHT : Infinity,
    ...system.labels.filter((l) => l.kind === "text").map((l) => l.y - 12),
  );
}
