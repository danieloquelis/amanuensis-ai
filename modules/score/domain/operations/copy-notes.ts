import { scoreKey } from "../key";
import { locateEvent } from "../queries";
import { durationFromBeats, eventOnsets, measureCapacity, soundingBeats } from "../rhythm";
import { spellRhythm } from "../rhythm-spelling";
import type { Measure, ScoreEvent } from "../schema";
import { barEvents, createMeasure, isRest, putVoiceBar, voiceLine } from "../voice-access";
import { copyAnchored, type CopyMap } from "./copy-anchored";
import { copyPieces, transformPieces } from "./copy-transform";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import { makeRests } from "./rests";
import type { OperationOf } from "./schema";

/** Exact comparison of beat positions, which are sums of written values. */
const EPSILON = 1e-9;

/** Copying respells notes for their new place, which a triplet cannot survive. */
const NO_TRIPLETS =
  "Copying notes into or out of a triplet isn't supported yet. Copy whole bars, or remove the triplet first.";

/** The copied notes, checked to be a run of consecutive events of one voice. */
function copiedRun(draft: Draft, eventIds: string[]): ScoreEvent[] {
  const line = voiceLine(draft, eventIds[0]);
  const start = line.findIndex((e) => e.id === eventIds[0]);
  const run = line.slice(start, start + eventIds.length);
  if (start === -1 || run.some((e, i) => e.id !== eventIds[i])) {
    throw new Error("Copy a run of consecutive notes and rests of one voice.");
  }
  return structuredClone(run);
}

/** What is left of an event cut at `at`: its first part, spelled for its place (a note's parts tied). */
function cutShort(event: ScoreEvent, onset: number, at: number, measure: Measure, id: string): ScoreEvent[] {
  if (isRest(event)) return makeRests(at - onset, id, onset, measure.meter);
  const parts = spellRhythm(onset, at - onset, measure.meter);
  return parts.map((part, k) => {
    const piece: ScoreEvent = { ...event, id: k === 0 ? event.id : `${id}-${k}`, duration: durationFromBeats(part) };
    // Its parts are tied together; the cut end is tied to nothing.
    if (k < parts.length - 1) piece.tie = true;
    else delete piece.tie;
    return piece;
  });
}

/**
 * Pastes a run of notes over the music of one voice from a target note on (or `offset` beats
 * after it), across barlines, developed on the way if asked (moved in the key, inverted,
 * reversed, augmented or diminished). A copied value that crosses a barline is split, a note's
 * parts tied; each part is spelled for its place in the bar. An old note cut by either end of the
 * copy leaves its first part, or a rest for its remainder.
 */
export function copyNotes(draft: Draft, op: OperationOf<"copyNotes">, { idPrefix }: OperationContext) {
  const run = copiedRun(draft, op.eventIds);
  if (run.some((event) => event.tuplet)) throw new Error(NO_TRIPLETS);
  const transform = { steps: op.steps, invert: op.invert, retrograde: op.retrograde, factor: op.factor };
  const pieces = transformPieces(copyPieces(run), transform, scoreKey(draft));
  const before = {
    annotations: structuredClone(draft.annotations),
    // A reversed run's slurs would run backwards: they stay behind.
    slurs: op.retrograde ? [] : structuredClone(draft.slurs),
  };
  const target = locateEvent(draft, op.toEventId);
  const { voiceId } = target;
  const map: CopyMap = { first: new Map(), last: new Map() };
  let measureIndex = target.measureIndex;
  let at = eventOnsets(target.voiceBar.events)[target.eventIndex] + (op.offset ?? 0);
  while (draft.measures[measureIndex] && at >= measureCapacity(draft.measures[measureIndex].meter) - EPSILON) {
    at -= measureCapacity(draft.measures[measureIndex].meter);
    measureIndex++;
  }
  let created = 0;
  while (pieces.length) {
    if (!draft.measures[measureIndex]) {
      const last = draft.measures.at(-1)!;
      const id = `${idPrefix}-bar${measureIndex}`;
      draft.measures.push(
        createMeasure(draft, { id, meter: { ...last.meter } }, (s) => fullMeasureRest(last.meter, `${id}-s${s}`)),
      );
    }
    const measure = draft.measures[measureIndex];
    if (!barEvents(measure, voiceId).length)
      putVoiceBar(draft, measure, voiceId, fullMeasureRest(measure.meter, `${idPrefix}-${measureIndex}`));
    const events = barEvents(measure, voiceId);
    const onsets = eventOnsets(events);
    const capacity = measureCapacity(measure.meter);
    const total = pieces.reduce((sum, p) => sum + p.left, 0);
    const end = Math.min(capacity, at + total);
    let keptBefore = events.filter((_, i) => onsets[i] < at - EPSILON);
    const keptAfter = events.filter((_, i) => onsets[i] >= end - EPSILON);
    const overwritten = events.filter((e) => !keptBefore.includes(e) && !keptAfter.includes(e));
    // Starting inside a note or rest (an offset): it is cut where the copy begins.
    const cut = keptBefore.at(-1);
    const cutOnset = cut ? onsets[events.indexOf(cut)] : 0;
    const cutEnd = cut ? cutOnset + soundingBeats(cut) : 0;
    if (cut && cutEnd > at + EPSILON) {
      if (cut.tuplet) throw new Error(NO_TRIPLETS);
      keptBefore = [
        ...keptBefore.slice(0, -1),
        ...cutShort(cut, cutOnset, at, measure, `${idPrefix}-${measureIndex}c`),
      ];
    }
    if (overwritten.some((event) => event.tuplet)) throw new Error(NO_TRIPLETS);
    detachFrom(
      draft,
      overwritten.map((e) => e.id),
    );
    // An old event running past the end of the copy leaves a rest for the rest of its length.
    const lastOverwritten = overwritten.at(-1);
    const overwrittenEnd = lastOverwritten
      ? onsets[events.indexOf(lastOverwritten)] + soundingBeats(lastOverwritten)
      : end;
    const tailEnd = Math.max(overwrittenEnd, cut && cutEnd > at + EPSILON ? cutEnd : 0);
    const tail =
      tailEnd > end + EPSILON ? makeRests(tailEnd - end, `${idPrefix}-${measureIndex}t`, end, measure.meter) : [];
    const written: ScoreEvent[] = [];
    while (pieces.length && at < end - EPSILON) {
      const piece = pieces[0];
      const length = Math.min(piece.left, end - at);
      const finishes = length >= piece.left - EPSILON;
      const parts = spellRhythm(at, length, measure.meter, isRest(piece.event));
      parts.forEach((part, k) => {
        const lastPart = finishes && k === parts.length - 1;
        const id = `${idPrefix}-n${created++}`;
        const { pitch, stack, tie, articulation, drums } = piece.event;
        const isFirst = !map.first.has(piece.event.id);
        if (isFirst) map.first.set(piece.event.id, id);
        map.last.set(piece.event.id, id);
        // A note split at a barline is tied through; the articulation stays on its first part. A
        // drum hit sounds once: the rest of its length is silence.
        if (drums && !isFirst) {
          written.push({ id, pitch: null, duration: durationFromBeats(part) });
          at += part;
          return;
        }
        written.push({
          id,
          pitch,
          ...(stack ? { stack } : {}),
          ...(drums ? { drums } : {}),
          duration: durationFromBeats(part),
          ...(isFirst && articulation ? { articulation } : {}),
          ...(!drums && (lastPart ? tie : !isRest(piece.event)) ? { tie: true as const } : {}),
        });
        at += part;
      });
      piece.left -= length;
      if (finishes) pieces.shift();
    }
    putVoiceBar(draft, measure, voiceId, [...keptBefore, ...written, ...tail, ...keptAfter]);
    measureIndex++;
    at = 0;
  }
  copyAnchored(draft, before, map, idPrefix);
}
