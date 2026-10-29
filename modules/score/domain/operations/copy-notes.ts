import { locateEvent } from "../queries";
import { durationFromBeats, eventOnsets, measureCapacity, soundingBeats } from "../rhythm";
import { spellRhythm } from "../rhythm-spelling";
import type { ScoreEvent } from "../schema";
import { barEvents, createMeasure, isRest, putVoiceBar, voiceLine } from "../voice-access";
import { copyAnchored, type CopyMap } from "./copy-anchored";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import { makeRests } from "./rests";
import type { OperationOf } from "./schema";

/** Exact comparison of beat positions, which are sums of written values. */
const EPSILON = 1e-9;

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

/**
 * Pastes a run of notes over the music of one voice from a target note on, across barlines. A
 * copied value that crosses a barline is split, a note's parts tied; each part is spelled for its
 * place in the bar. An old note cut by the end of the copy leaves a rest for its remainder.
 */
export function copyNotes(draft: Draft, op: OperationOf<"copyNotes">, { idPrefix }: OperationContext) {
  const pieces = copiedRun(draft, op.eventIds).map((event) => ({ event, left: soundingBeats(event) }));
  const before = { annotations: structuredClone(draft.annotations), slurs: structuredClone(draft.slurs) };
  const target = locateEvent(draft, op.toEventId);
  const { voiceId } = target;
  const map: CopyMap = { first: new Map(), last: new Map() };
  let measureIndex = target.measureIndex;
  let at = eventOnsets(target.voiceBar.events)[target.eventIndex];
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
    const keptBefore = events.filter((_, i) => onsets[i] < at - EPSILON);
    const keptAfter = events.filter((_, i) => onsets[i] >= end - EPSILON);
    const overwritten = events.filter((e) => !keptBefore.includes(e) && !keptAfter.includes(e));
    detachFrom(
      draft,
      overwritten.map((e) => e.id),
    );
    // An old event running past the end of the copy leaves a rest for the rest of its length.
    const lastOverwritten = overwritten.at(-1);
    const tailEnd = lastOverwritten ? onsets[events.indexOf(lastOverwritten)] + soundingBeats(lastOverwritten) : end;
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
        const { pitch, stack, tie, articulation } = piece.event;
        const isFirst = !map.first.has(piece.event.id);
        if (isFirst) map.first.set(piece.event.id, id);
        map.last.set(piece.event.id, id);
        // A note split at a barline is tied through; the articulation stays on its first part.
        written.push({
          id,
          pitch,
          ...(stack ? { stack } : {}),
          duration: durationFromBeats(part),
          ...(isFirst && articulation ? { articulation } : {}),
          ...((lastPart ? tie : !isRest(piece.event)) ? { tie: true as const } : {}),
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
