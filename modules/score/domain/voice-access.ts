import type { Measure, Part, Score, ScoreEvent, Staff, VoiceBar } from "./schema";

/**
 * The one place that knows how a bar stores its events. Everything else reads and writes bar
 * events through these accessors.
 *
 * A score declares parts → staves → voices. A bar holds one voice bar per voice that plays there,
 * in that declared order: every staff's first voice has a bar in every measure, so
 * `measure.voices[0]` is the score's primary voice (first part, first staff, first voice).
 */

export type { VoiceBar };

/** How a staff's bar is shown instead of its notes: rhythm slashes, or a repeat (%) of the bar before. */
export type BarStyle = NonNullable<VoiceBar["style"]>;

/** Where a voice sits in the score. */
export type VoiceInfo = { part: Part; staff: Staff; voiceIndex: number; staffIndex: number };

/** The voice bars of a measure, in declared voice order. */
export const voiceBars = (measure: Measure): VoiceBar[] => measure.voices;

const barOf = (measure: Measure, voiceId?: string): VoiceBar | undefined =>
  voiceId === undefined ? measure.voices[0] : measure.voices.find((bar) => bar.voiceId === voiceId);

/** The events of one voice in a bar (the primary voice when omitted); empty when it is silent there. */
export const barEvents = (measure: Measure, voiceId?: string): ScoreEvent[] => barOf(measure, voiceId)?.events ?? [];

/** Replaces the events of one voice bar (the primary voice when omitted); the bar must exist. */
export function setBarEvents(measure: Measure, events: ScoreEvent[], voiceId?: string) {
  const bar = barOf(measure, voiceId);
  if (!bar) throw new Error("That voice has no bar there.");
  bar.events = events;
}

/** Writes a voice's events into a bar, adding its voice bar in declared order when it has none. */
export function putVoiceBar(score: Score, measure: Measure, voiceId: string, events: ScoreEvent[]) {
  const existing = barOf(measure, voiceId);
  if (existing) {
    existing.events = events;
    return;
  }
  const order = voiceIds(score);
  if (!order.includes(voiceId)) throw new Error("That voice is not in the score.");
  measure.voices.push({ voiceId, events });
  measure.voices.sort((a, b) => order.indexOf(a.voiceId) - order.indexOf(b.voiceId));
}

/** Takes a voice out of a bar (it falls silent there). A staff's main line cannot leave. */
export function removeVoiceBar(measure: Measure, voiceId: string) {
  if (measure.voices[0]?.voiceId === voiceId) throw new Error("The main line of a bar cannot be removed.");
  measure.voices = measure.voices.filter((bar) => bar.voiceId !== voiceId);
}

/** Every event of a bar, all voices, in voice order. */
export const measureEvents = (measure: Measure): ScoreEvent[] => measure.voices.flatMap((bar) => bar.events);

/** How a voice bar (the primary one when omitted) is shown instead of its notes, if it is. */
export const barStyle = (measure: Measure, voiceId?: string): BarStyle | undefined => barOf(measure, voiceId)?.style;

/** Shows a staff's bar as slashes or a repeat sign, or (with `undefined`) as its notes again. */
export function setBarStyle(measure: Measure, style: BarStyle | undefined, voiceId?: string) {
  const bar = barOf(measure, voiceId);
  if (!bar) throw new Error("That voice has no bar there.");
  if (style) bar.style = style;
  else delete bar.style;
}

/** A new bar where every staff's first voice holds `eventsFor(staffIndex)`, usually a whole-bar rest. */
export function createMeasure(
  score: Pick<Score, "parts">,
  fields: Omit<Measure, "voices">,
  eventsFor: (staffIndex: number) => ScoreEvent[],
): Measure {
  const voices = allStaves(score).map((staff, index) => ({ voiceId: staff.voices[0].id, events: eventsFor(index) }));
  return { ...fields, voices };
}

/** Every declared voice, in order: part, staff, voice. */
export const voiceIds = (score: Pick<Score, "parts">): string[] =>
  allStaves(score).flatMap((staff) => staff.voices.map((voice) => voice.id));

/** The score's primary voice: first part, first staff, first voice. It has a bar everywhere. */
export const primaryVoiceId = (score: Pick<Score, "parts">): string => score.parts[0].staves[0].voices[0].id;

/** Every staff, in order. */
export const allStaves = (score: Pick<Score, "parts">): Staff[] => score.parts.flatMap((part) => part.staves);

/** Where a declared voice sits, or null. */
export function voiceInfo(score: Pick<Score, "parts">, voiceId: string): VoiceInfo | null {
  let staffIndex = 0;
  for (const part of score.parts)
    for (const staff of part.staves) {
      const voiceIndex = staff.voices.findIndex((voice) => voice.id === voiceId);
      if (voiceIndex !== -1) return { part, staff, voiceIndex, staffIndex };
      staffIndex++;
    }
  return null;
}

/** The part an event is played by (the first part when the event is gone). */
export function partOf(score: Score, eventId: string): Part {
  const voiceId = voiceOf(score, eventId);
  return (voiceId && voiceInfo(score, voiceId)?.part) || score.parts[0];
}

/** One voice's events across the whole score, bar by bar: the order ties and slurs follow. */
export const voiceEvents = (score: Score, voiceId?: string): ScoreEvent[] =>
  score.measures.flatMap((measure) => barEvents(measure, voiceId ?? primaryVoiceId(score)));

/** Every event in the score, all voices. */
export const everyEvent = (score: Score): ScoreEvent[] => score.measures.flatMap(measureEvents);

/** The voice an event belongs to, or null when it is not in the score. */
export function voiceOf(score: Score, eventId: string): string | null {
  for (const measure of score.measures)
    for (const bar of measure.voices) if (bar.events.some((e) => e.id === eventId)) return bar.voiceId;
  return null;
}

/** The events of the voice `eventId` is in, bar by bar (the primary voice when it is gone). */
export const voiceLine = (score: Score, eventId: string): ScoreEvent[] =>
  voiceEvents(score, voiceOf(score, eventId) ?? primaryVoiceId(score));

/** Whether the event sounds: a note, as opposed to a rest. */
export const isNote = (event: ScoreEvent) => event.pitch !== null;

/** Whether the event is silence. */
export const isRest = (event: ScoreEvent) => !isNote(event);
