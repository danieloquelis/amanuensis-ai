import { beats } from "../domain/rhythm";
import type { Score } from "../domain/schema";

/**
 * Positions for things other than notes, as score text shows them: "chord 2:3" (the chord in
 * bar 2 on beat 3), "slur 2#1" (the slur starting at bar 2's first note), "mark 4 fine",
 * "repeat 1" (the repeat starting at bar 1), "dynamic 2:1" and "text 2:1" (on bar 2, beat 1).
 */
const HANDLE = /^(chord|slur|mark|repeat|dynamic|text)\s+(.+)$/;
const AT_BEAT = /^(\d+):(\d+(?:\.\d+)?)$/;
const AT_ORDER = /^(\d+)#(\d+)$/;
const EPSILON = 1e-9;

export const isNotationHandle = (value: unknown): value is string => typeof value === "string" && HANDLE.test(value);

/** Onset (0-based beats) of each event in a bar, by ID. */
function onsets(score: Score, barIndex: number): Map<string, number> {
  const map = new Map<string, number>();
  let beat = 0;
  for (const event of score.measures[barIndex]?.events ?? []) {
    map.set(event.id, beat);
    beat += beats(event.duration);
  }
  return map;
}

/** The note an "n:beat" or "n#k" position names, or null. */
function eventAt(score: Score, where: string): { id: string; bar: number; beat: number } | null {
  const order = AT_ORDER.exec(where);
  const at = AT_BEAT.exec(where);
  const bar = Number((order ?? at)?.[1]) - 1;
  const measure = score.measures[bar];
  if (!measure) return null;
  const event = order
    ? measure.events[Number(order[2]) - 1]
    : measure.events.find((e) => Math.abs(onsets(score, bar).get(e.id)! - (Number(at?.[2]) - 1)) < EPSILON);
  return event ? { id: event.id, bar, beat: onsets(score, bar).get(event.id)! } : null;
}

/** The ID of the chord, slur, mark, repeat or indication a handle names; throws when there is none. */
export function notationAt(score: Score, handle: string): string {
  const [, kind, where] = HANDLE.exec(handle)!;
  const bar = (n: string) => score.measures[Number(n) - 1];
  const found = (() => {
    switch (kind) {
      case "chord": {
        const at = AT_BEAT.exec(where);
        const measure = at && bar(at[1]);
        return score.chords.find(
          (c) => c.measureId === measure?.id && Math.abs(c.beat - (Number(at![2]) - 1)) < EPSILON,
        );
      }
      case "slur":
        return score.slurs.find((s) => s.startEventId === eventAt(score, where)?.id);
      case "mark": {
        const [n, markKind] = where.split(/\s+/);
        return score.marks.find((m) => m.measureId === bar(n)?.id && (!markKind || m.kind === markKind));
      }
      case "repeat":
        return score.repeats.find((r) => r.startMeasureId === bar(where.split("-")[0])?.id);
      default: {
        const event = eventAt(score, where);
        const measure = event && score.measures[event.bar];
        const anchors = [event?.id, event?.beat === 0 ? measure?.id : undefined];
        return score.annotations.find(
          (a) => a.kind === (kind === "dynamic" ? "dynamic" : "text") && anchors.includes(a.targetId),
        );
      }
    }
  })();
  if (!found) throw new Error(`There is no ${handle} in the score.`);
  return found.id;
}

/** How score text names something by its ID: "2#3", "2", "chord 2:3", …; the ID when unknown. */
export function positionOf(score: Score, id: string): string {
  const barOf = (measureId: string) => score.measures.findIndex((m) => m.id === measureId) + 1;
  for (const [index, measure] of score.measures.entries()) {
    if (measure.id === id) return `${index + 1}`;
    const order = measure.events.findIndex((e) => e.id === id);
    if (order !== -1) return `${index + 1}#${order + 1}`;
  }
  const chord = score.chords.find((c) => c.id === id);
  if (chord) return `chord ${barOf(chord.measureId)}:${chord.beat + 1}`;
  const slur = score.slurs.find((s) => s.id === id);
  if (slur) return `slur ${positionOf(score, slur.startEventId)}`;
  const mark = score.marks.find((m) => m.id === id);
  if (mark) return `mark ${barOf(mark.measureId)} ${mark.kind}`;
  const repeat = score.repeats.find((r) => r.id === id);
  if (repeat) return `repeat ${barOf(repeat.startMeasureId)}`;
  const annotation = score.annotations.find((a) => a.id === id);
  if (annotation) {
    const target = positionOf(score, annotation.targetId);
    const [bar, order] = target.split("#");
    const beat = order ? onsets(score, Number(bar) - 1).get(annotation.targetId)! + 1 : 1;
    return `${annotation.kind === "dynamic" ? "dynamic" : "text"} ${bar}:${beat}`;
  }
  return id;
}
