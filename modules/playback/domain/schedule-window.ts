import type { PlaybackPlan } from "./plan";

/** One note to sound, in seconds from the start of playback. */
export type PlannedSound = { midi: number; start: number; duration: number; velocity: number };

/**
 * Every note that starts in `[from, to)` seconds: melody notes for their sounding length (the
 * gate), chord-symbol notes for the length of their chord. The transport calls this for each
 * lookahead window, so the windows together cover the plan exactly once.
 */
export function soundsBetween(plan: PlaybackPlan, from: number, to: number): PlannedSound[] {
  const within = (start: number) => start >= from && start < to;
  const sounds: PlannedSound[] = [];
  for (const event of plan.events) {
    if (!within(event.start)) continue;
    for (const midi of event.notes)
      sounds.push({ midi, start: event.start, duration: event.duration * event.gate, velocity: event.velocity });
  }
  for (const chord of plan.chords) {
    if (!within(chord.start)) continue;
    for (const midi of chord.notes)
      sounds.push({ midi, start: chord.start, duration: chord.duration, velocity: chord.velocity });
  }
  return sounds.sort((a, b) => a.start - b.start);
}
