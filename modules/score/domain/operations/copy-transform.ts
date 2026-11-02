import { keyAlter, spellMidi } from "../key";
import { isWithinPitchRange, midiPitch, staffPosition, STEPS } from "../pitch";
import { soundingBeats } from "../rhythm";
import type { KeySignature, Pitch, ScoreEvent } from "../schema";
import { eventPitches, writeNotes } from "../stacks";
import { isRest } from "../voice-access";

/** One copied note or rest, with the length still to write (a tied run is one piece). */
export type CopyPiece = { event: ScoreEvent; left: number };

/** How a copied run is developed on its way, as a composer develops a motif. */
export type CopyTransform = {
  /** Staff steps to move it, in the key (4: up a fifth; -7: an octave down); accidentals outside the key are kept. */
  steps?: number;
  /** Upside down: every interval mirrored around the first note. */
  invert?: boolean;
  /** Backwards: last note first. */
  retrograde?: boolean;
  /** Note values multiplied: 2 twice as slow, 0.5 twice as fast. */
  factor?: number;
};

const SEMITONES_ABOVE_C = [0, 2, 4, 5, 7, 9, 11];

/** The pitch at a staff position, keeping the note's distance from the key (a leading tone stays raised). */
function placed(position: number, original: Pitch, key: KeySignature): Pitch {
  const step = STEPS[((position % 7) + 7) % 7];
  const octave = Math.floor(position / 7);
  const alter = keyAlter(key, step) + (original.alter - keyAlter(key, original.step));
  if (alter >= -1 && alter <= 1) return { step, alter: alter as -1 | 0 | 1, octave };
  // Two accidentals away from the letter: the same sound, spelled the plainer way.
  return spellMidi((octave + 1) * 12 + SEMITONES_ABOVE_C[STEPS.indexOf(step)] + alter, key);
}

/**
 * The run as pieces to write: notes tied to the next one of the same pitch join into one piece,
 * so a transformed rhythm is spelled afresh. The last piece keeps a tie that leaves the run.
 */
export function copyPieces(run: ScoreEvent[]): CopyPiece[] {
  const pieces: CopyPiece[] = [];
  run.forEach((event, i) => {
    const previous = pieces.at(-1);
    const joins =
      previous?.event.tie &&
      !isRest(event) &&
      midiPitch(previous.event.pitch!) === midiPitch(event.pitch!) &&
      i > 0 &&
      run[i - 1].tie;
    if (joins) {
      previous.left += soundingBeats(event);
      previous.event = { ...previous.event, tie: event.tie };
      if (!event.tie) delete previous.event.tie;
      return;
    }
    pieces.push({ event: structuredClone(event), left: soundingBeats(event) });
  });
  return pieces;
}

/** Develops the pieces as asked: moved, inverted, reversed, augmented or diminished. */
export function transformPieces(pieces: CopyPiece[], transform: CopyTransform, key: KeySignature): CopyPiece[] {
  let result = pieces.map((piece) => ({ event: structuredClone(piece.event), left: piece.left }));
  if (transform.factor && transform.factor !== 1) {
    for (const piece of result) piece.left *= transform.factor;
  }
  if (transform.retrograde) {
    result = result.reverse();
    // Ties run forwards: reversed, they would join the wrong notes.
    for (const piece of result) delete piece.event.tie;
  }
  const first = result.find((piece) => piece.event.pitch && !piece.event.drums)?.event.pitch;
  const axis = first ? staffPosition(first) : 0;
  const steps = transform.steps ?? 0;
  if (!steps && !transform.invert) return result;
  for (const { event } of result) {
    if (!event.pitch || event.drums) continue;
    const moved = eventPitches(event).map((pitch) => {
      const position = staffPosition(pitch);
      const mirrored = transform.invert ? 2 * axis - position : position;
      return placed(mirrored + steps, pitch, key);
    });
    if (!moved.every(isWithinPitchRange)) {
      throw new Error("That would move notes beyond A0–C8, the range of any instrument.");
    }
    writeNotes(
      event,
      [...moved].sort((a, b) => midiPitch(a) - midiPitch(b)),
    );
  }
  return result;
}
