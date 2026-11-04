import type { SungNote } from "./note-pieces";
import type { PitchFrame } from "./pitch-tracker";

/**
 * A plucked string (or a held note let go) keeps ringing after it is played: a clean, quiet tone
 * that YIN reads as pitched. As it dies away the pitch drops in and out, and each return would be
 * a new, made-up note, usually a repeat of the last one. Played notes start louder than that.
 */

/** A note out of a silence quieter than this share of the ring before it is the ring returning. */
const RETURN_SHARE = 0.4;
/** A note quieter than this share of the phrase's typical note is a fading tail, not a played note. */
const PHRASE_SHARE = 0.35;
/** How much of the previous note's end the ring is measured over (seconds). */
const RING_SECONDS = 0.1;
/** Notes further apart than this (seconds) have a silence between them. */
const SILENCE_SECONDS = 0.035;
/** A phrase needs this many notes for its typical loudness to mean anything. */
const MIN_PHRASE_NOTES = 3;

/** The loudest frame between two times (seconds). */
function peak(frames: PitchFrame[], from: number, to: number): number {
  let loudest = 0;
  for (const frame of frames) {
    if (frame.time >= from && frame.time < to) loudest = Math.max(loudest, frame.rms);
  }
  return loudest;
}

/** The notes without those that are only an earlier note still ringing. */
export function dropFadingNotes(notes: SungNote[], frames: PitchFrame[]): SungNote[] {
  if (notes.length < MIN_PHRASE_NOTES) return notes;
  const peaks = notes.map((note) => peak(frames, note.start, note.end));
  const typical = [...peaks].sort((a, b) => a - b)[Math.floor(peaks.length / 2)];
  const kept: SungNote[] = [];
  notes.forEach((note, index) => {
    const previous = kept.at(-1);
    if (previous) {
      const ring = peak(frames, previous.end - RING_SECONDS, previous.end + SILENCE_SECONDS);
      const afterSilence = note.start - previous.end > SILENCE_SECONDS;
      if (afterSilence && peaks[index] < RETURN_SHARE * ring) return;
      if (peaks[index] < PHRASE_SHARE * typical) return;
    }
    kept.push(note);
  });
  return kept;
}
