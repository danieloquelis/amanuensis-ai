import {
  applyCommand,
  barEvents,
  eventOnsets,
  isNote,
  midiPitch,
  numberedVoice,
  type Operation,
  type Score,
} from "@/modules/score";
import type { HeardOption } from "./sung-figures";

/**
 * Changes the singing itself allows in heard bars: `options` (a note the ear nearly heard, or the
 * one completing a figure) and, per heard voice (1 is the main line), how many repeats of a
 * neighbouring note may be added where voice_check found an attack the ear could not pitch.
 */
export type HeardAllowances = { options: HeardOption[]; repeats: Map<number, number> };

type Attack = { midi: number; bar: number; beat: number };

/** The notes of a heard line's bars, in order: one per attack (a tied chain once). */
function attacksOf(score: Score, measureIds: string[], voice: number): Attack[] {
  const voiceId = numberedVoice(score, voice) ?? undefined;
  const found: Attack[] = [];
  let tiedOn = false;
  for (const id of measureIds) {
    const bar = score.measures.findIndex((m) => m.id === id) + 1;
    const events = barEvents(score.measures[bar - 1], voiceId);
    const onsets = eventOnsets(events);
    events.forEach((event, i) => {
      if (isNote(event) && event.pitch && !tiedOn) found.push({ midi: midiPitch(event.pitch), bar, beat: onsets[i] });
      tiedOn = isNote(event) && Boolean(event.tie);
    });
  }
  return found;
}

const BEAT_TOLERANCE = 1e-6;

/** Pitches a heard note may become: itself, and any option for its place. */
function allowed(note: Attack, options: HeardOption[]): number[] {
  const others = options
    .filter((o) => o.bar === note.bar && Math.abs(o.beat - note.beat) < BEAT_TOLERANCE)
    .map((o) => midiPitch(o.pitch));
  return [note.midi, ...others];
}

/**
 * Whether an edit keeps what was heard: after it, the heard line's notes are the same notes in
 * the same order (any rhythm), except a note changed to one of its options or a repeat of a
 * neighbouring note added where an attack went unpitched. Nothing heard is dropped, nothing
 * else is made up. `lines` maps each heard voice number to its bars, in order.
 */
export function keepsHeardNotes(
  score: Score,
  operation: Operation,
  lines: Map<number, string[]>,
  allowances: HeardAllowances,
): boolean {
  let after: Score;
  try {
    after = applyCommand(score, { requestId: "heard-check", expectedRevision: score.revision, operation });
  } catch {
    // An edit the score refuses anyway: the tool reports why.
    return true;
  }
  for (const [voice, measureIds] of lines) {
    const before = attacksOf(score, measureIds, voice);
    const now = attacksOf(after, measureIds, voice);
    let repeats = allowances.repeats.get(voice) ?? 0;
    let i = 0;
    for (const note of now) {
      if (i < before.length && allowed(before[i], allowances.options).includes(note.midi)) {
        i++;
        continue;
      }
      const neighbours = [before[i - 1]?.midi, before[i]?.midi];
      if (repeats > 0 && neighbours.includes(note.midi)) {
        repeats--;
        continue;
      }
      return false;
    }
    if (i < before.length) return false;
  }
  return true;
}
