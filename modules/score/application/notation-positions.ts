import { findEvent } from "../domain/queries";
import { eventOnsets } from "../domain/rhythm";
import type { Score } from "../domain/schema";
import { findVoiceId, staffHandle } from "../domain/handles";
import { barEvents, voiceBars, voiceInfo, voiceNumber } from "../domain/voice-access";

/**
 * Positions for things other than notes, as score text shows them: "chord 2:3" (the chord in
 * bar 2 on beat 3), "slur 2#1" (the slur starting at bar 2's first note), "mark 4 fine",
 * "repeat 1" (the repeat starting at bar 1), "dynamic 2:1" and "text 2:1" (on bar 2, beat 1).
 */
const HANDLE = /^(chord|slur|mark|repeat|dynamic|text)\s+(.+)$/;
const AT_BEAT = /^(?:([a-z][\w-]*(?:\.\d)?)\/)?(\d+)(?:v(\d))?:(\d+(?:\.\d+)?)$/;
const AT_ORDER = /^(?:([a-z][\w-]*(?:\.\d)?)\/)?(\d+)(?:v(\d))?#(\d+)$/;
const EPSILON = 1e-9;
/**
 * How close a written beat must be to a note's onset: "1.33" names a triplet's second note (1⅓). A
 * third of a beat is at least 1/24 beat from any eighth-grid position, so this never picks the wrong one.
 */
const BEAT_TOLERANCE = 0.01;

export const isNotationHandle = (value: unknown): value is string => typeof value === "string" && HANDLE.test(value);

/** The note an "n:beat" or "n#k" position names (with "vK" for another voice: "2v2#1"), or null. */
function eventAt(score: Score, where: string): { id: string; bar: number; beat: number } | null {
  const match = AT_ORDER.exec(where) ?? AT_BEAT.exec(where);
  if (!match) return null;
  const [, staff, barText, voice, place] = match;
  const bar = Number(barText) - 1;
  const measure = score.measures[bar];
  const voiceId = findVoiceId(score, `${staff ? `${staff}/` : ""}v${voice ?? 1}`);
  if (!measure || !voiceId) return null;
  const events = barEvents(measure, voiceId);
  const onsets = eventOnsets(events);
  const index = AT_ORDER.test(where)
    ? Number(place) - 1
    : onsets.findIndex((onset) => Math.abs(onset - (Number(place) - 1)) < BEAT_TOLERANCE);
  const event = events[index];
  return event ? { id: event.id, bar, beat: onsets[index] } : null;
}

/** The ID of the chord, slur, mark, repeat or indication a handle names; throws when there is none. */
export function notationAt(score: Score, handle: string): string {
  const [, kind, where] = HANDLE.exec(handle)!;
  const bar = (n: string) => score.measures[Number(n) - 1];
  const found = (() => {
    switch (kind) {
      case "chord": {
        const at = AT_BEAT.exec(where);
        const measure = at && bar(at[2]);
        return score.chords.find(
          (c) => c.measureId === measure?.id && Math.abs(c.beat - (Number(at![4]) - 1)) < EPSILON,
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
    for (const bar of voiceBars(measure)) {
      const order = bar.events.findIndex((e) => e.id === id);
      if (order === -1) continue;
      // Another staff than the first is named first: "trumpet/3#2".
      const info = voiceInfo(score, bar.voiceId)!;
      const staff = info.staffIndex > 0 ? `${staffHandle(score, info.staff.id)}/` : "";
      const voice = voiceNumber(score, bar.voiceId);
      return `${staff}${index + 1}${voice > 1 ? `v${voice}` : ""}#${order + 1}`;
    }
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
    const [bar] = target.split("#");
    const found = findEvent(score, annotation.targetId);
    const beat = found ? eventOnsets(found.voiceBar.events)[found.eventIndex] + 1 : 1;
    return `${annotation.kind === "dynamic" ? "dynamic" : "text"} ${bar}:${beat}`;
  }
  return id;
}
