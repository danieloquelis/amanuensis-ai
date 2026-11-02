import {
  applyCommand,
  barEvents,
  eventOnsets,
  eventPitches,
  isDrumKit,
  midiPitch,
  staffHandle,
  type Measure,
  type Operation,
  type Score,
} from "@/modules/score";

/** The staff that carries the song's tune: its part, staff and main voice, and its handle. */
export type TuneLine = { partId: string; staffId: string; voiceId: string; handle: string };

/** A bar of the tune a musician must keep: its notes as planned (where each starts, what sounds). */
export type KeptBar = { voiceId: string; measureId: string; bar: number; notes: string };

/** A line plays the tune when it has notes in at least this share of the bars… */
const TUNE_BARS = 0.5;
/** …mostly one note at a time. */
const MAX_STACKED = 0.2;

/**
 * The song's tune as it stands: the first pitched staff whose main voice plays single notes
 * through most of the song (a lead sheet's melody, a sung or played-in line). None in a song
 * that has no tune yet.
 */
export function findTune(score: Score): TuneLine | null {
  for (const part of score.parts) {
    if (isDrumKit(part.instrument)) continue;
    for (const staff of part.staves) {
      const voiceId = staff.voices[0].id;
      const events = score.measures.flatMap((measure) => barEvents(measure, voiceId)).filter((e) => e.pitch);
      const bars = score.measures.filter((measure) => barEvents(measure, voiceId).some((e) => e.pitch)).length;
      const stacked = events.filter((event) => event.stack?.length).length;
      if (bars >= score.measures.length * TUNE_BARS && stacked <= events.length * MAX_STACKED) {
        return { partId: part.id, staffId: staff.id, voiceId, handle: staffHandle(score, staff.id) ?? part.id };
      }
    }
  }
  return null;
}

/** A bar's notes in one voice, as they start: "beat:pitches" for each struck note (held ones left out). */
export function barNotes(measure: Measure, voiceId: string): string {
  const events = barEvents(measure, voiceId);
  const onsets = eventOnsets(events);
  let held: number[] = [];
  const struck: string[] = [];
  events.forEach((event, i) => {
    const midi = eventPitches(event).map(midiPitch);
    if (midi.length && !midi.every((m) => held.includes(m))) struck.push(`${onsets[i]}:${midi.join(".")}`);
    held = event.tie ? midi : [];
  });
  return struck.join(" ");
}

/** The tune's bars in a voice as they are now, to keep. */
export const keptBars = (score: Score, voiceId: string, measureIds: string[]): KeptBar[] =>
  measureIds.map((measureId) => {
    const bar = score.measures.findIndex((m) => m.id === measureId);
    return { voiceId, measureId, bar, notes: barNotes(score.measures[bar], voiceId) };
  });

/**
 * Why an edit is refused because it changes the tune where the plan gives it to this musician, or
 * null. Phrasing it (articulation, dynamics, note lengths) is fine; its notes and where they start are not.
 */
export function refuseTuneChange(score: Score, operation: Operation, kept: KeptBar[]): string | null {
  if (!kept.length) return null;
  let after: Score;
  try {
    after = applyCommand(score, { requestId: "tune-guard", expectedRevision: score.revision, operation });
  } catch {
    return null;
  }
  const changed = kept.filter(({ voiceId, measureId, notes }) => {
    const measure = after.measures.find((m) => m.id === measureId);
    return !measure || barNotes(measure, voiceId) !== notes;
  });
  if (!changed.length) return null;
  const bars = changed.map((k) => k.bar + 1).join(", ");
  return `Bars ${bars} carry the song's tune in your part, as the bandleader planned: keep its notes and where they start (phrase it with articulation, dynamics or note lengths), and write around it.`;
}
