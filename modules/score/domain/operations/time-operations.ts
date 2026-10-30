import { getMeasure, resolveVoice } from "../queries";
import { measureCapacity } from "../rhythm";
import { SCORE_LIMITS } from "../schema";
import { createMeasure, isNote, putVoiceBar, voiceBars, voiceIds } from "../voice-access";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import { barsOf, insertTime, lineNotes, removeTime, stretchTime as stretched, type Placed } from "./reflow";
import type { OperationOf } from "./schema";

/** A line's notes after the change, and the IDs of notes it cut out. */
type Change = (notes: Placed[], prefix: string) => { notes: Placed[]; removed: string[] };
/** Where a point of the music (beats from the first bar reflowed) lands after the change; null when cut out. */
type Moved = (at: number) => number | null;

const EPSILON = 1e-9;
/** Chord symbols sit on an eighth-of-a-beat grid. */
const CHORD_GRID = 0.125;

const capacityOf = (draft: Draft, from: number) =>
  draft.measures.slice(from).reduce((sum, measure) => sum + measureCapacity(measure.meter), 0);

/** Bars added at the end until the score holds `length` beats from bar `from`. */
function makeRoom(draft: Draft, from: number, length: number, idPrefix: string) {
  while (capacityOf(draft, from) < length - EPSILON) {
    if (draft.measures.length >= SCORE_LIMITS.measures) {
      throw new Error(`The music would run past bar ${SCORE_LIMITS.measures}, the most a score holds.`);
    }
    const meter = { ...draft.measures.at(-1)!.meter };
    const id = `${idPrefix}-bar${draft.measures.length}`;
    draft.measures.push(createMeasure(draft, { id, meter }, (staff) => fullMeasureRest(meter, `${id}-s${staff}`)));
  }
}

/** Chord symbols from bar `from` on, moved with the music (or dropped where it was cut out). */
function moveChords(draft: Draft, from: number, moved: Moved) {
  const measures = draft.measures.slice(from);
  const starts = measures.map((_, k) => capacityOf(draft, from) - capacityOf(draft, from + k));
  draft.chords = draft.chords.flatMap((chord) => {
    const index = measures.findIndex((measure) => measure.id === chord.measureId);
    if (index === -1) return [chord];
    const at = moved(starts[index] + chord.beat);
    const bar = at === null ? -1 : starts.findLastIndex((start) => start <= at + EPSILON);
    if (at === null || bar === -1 || at - starts[bar] >= measureCapacity(measures[bar].meter) - EPSILON) return [];
    const beat = Math.round((at - starts[bar]) / CHORD_GRID) * CHORD_GRID;
    return [{ ...chord, measureId: measures[bar].id, beat }];
  });
}

/**
 * Changes the music of every line (or the one named) from bar `from` in time, then writes it back
 * into the bars, adding bars at the end when it grew. A second voice stays out of bars where it
 * has nothing. Rests are rewritten, and what was anchored to cut notes goes with them.
 */
function reflow(
  draft: Draft,
  from: number,
  voiceId: string | undefined,
  change: Change,
  moved: Moved,
  idPrefix: string,
) {
  const lines = voiceId ? [resolveVoice(draft, voiceId)] : voiceIds(draft);
  const changed = lines.map((line, k) => {
    const { notes, rests } = lineNotes(draft.measures.slice(from), line);
    const after = change(notes, `${idPrefix}-l${k}`);
    return { line, notes: after.notes, gone: [...rests, ...after.removed] };
  });
  makeRoom(draft, from, Math.max(0, ...changed.flatMap(({ notes }) => notes.map((n) => n.at + n.length))), idPrefix);
  const gone = new Set(changed.flatMap((line) => line.gone));
  detachFrom(draft, [...gone]);
  draft.slurs = draft.slurs.filter((slur) => !gone.has(slur.startEventId) && !gone.has(slur.endEventId));
  const measures = draft.measures.slice(from);
  changed.forEach(({ line, notes }, k) => {
    const bars = barsOf(
      notes,
      measures.map((measure) => measure.meter),
      `${idPrefix}-l${k}`,
    );
    measures.forEach((measure, b) => {
      const present = voiceBars(measure).some((bar) => bar.voiceId === line);
      if (present || bars[b].some(isNote)) putVoiceBar(draft, measure, line, bars[b]);
    });
  });
  if (!voiceId) moveChords(draft, from, moved);
}

export function shiftTime(draft: Draft, op: OperationOf<"shiftTime">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  const from = draft.measures.indexOf(measure);
  const capacity = measureCapacity(measure.meter);
  if (op.beat >= capacity) throw new Error(`Bar ${from + 1} has ${capacity} beats: beat ${op.beat} is past its end.`);
  const at = op.beat;
  const length = Math.abs(op.beats);
  if (op.beats > 0) {
    const insert: Change = (notes, prefix) => ({
      notes: insertTime(notes, at, length, (k) => `${prefix}-n${k}`),
      removed: [],
    });
    reflow(draft, from, op.voiceId, insert, (point) => (point >= at - EPSILON ? point + length : point), idPrefix);
    return;
  }
  const remove: Change = (notes) => {
    const { kept, removed } = removeTime(notes, at, length);
    return { notes: kept, removed };
  };
  const moved: Moved = (point) =>
    point < at - EPSILON ? point : point < at + length - EPSILON ? null : point - length;
  reflow(draft, from, op.voiceId, remove, moved, idPrefix);
}

export function stretchTime(draft: Draft, op: OperationOf<"stretchTime">, { idPrefix }: OperationContext) {
  const indices = op.measureIds.map((id) => draft.measures.indexOf(getMeasure(draft, id)));
  if (indices.some((index, k) => k > 0 && index !== indices[k - 1] + 1)) {
    throw new Error("Give the bars to stretch in order, without gaps.");
  }
  const from = indices[0];
  const span = indices.reduce((sum, index) => sum + measureCapacity(draft.measures[index].meter), 0);
  const { factor } = op;
  const change: Change = (notes) => ({ notes: stretched(notes, 0, span, factor), removed: [] });
  const moved: Moved = (point) => (point < span - EPSILON ? point * factor : point + span * (factor - 1));
  reflow(draft, from, op.voiceId, change, moved, idPrefix);
}
