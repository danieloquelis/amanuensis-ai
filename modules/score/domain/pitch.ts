import { keyAlter } from "./key";
import type { KeySignature, Pitch } from "./schema";

export const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Step = (typeof STEPS)[number];

export const OCTAVE_RANGE = { min: 3, max: 6 } as const;

const SEMITONES_ABOVE_C = [0, 2, 4, 5, 7, 9, 11];

export function pitchName(pitch: Pitch | null): string {
  if (!pitch) return "Rest";
  const accidental = pitch.alter === 1 ? "♯" : pitch.alter === -1 ? "♭" : "";
  return `${pitch.step}${accidental}${pitch.octave}`;
}

/** Diatonic position counted in staff steps (lines and spaces), ignoring accidentals. */
export function staffPosition(pitch: Pitch): number {
  return pitch.octave * 7 + STEPS.indexOf(pitch.step);
}

export function midiPitch(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + SEMITONES_ABOVE_C[STEPS.indexOf(pitch.step)] + pitch.alter;
}

/**
 * Moves a pitch by diatonic staff steps. With a key, the result takes the key's alteration
 * (F♯ up a step in D major is G); without one, the accidental is kept.
 */
export function movePitch(pitch: Pitch, steps: number, key?: KeySignature): Pitch {
  const position = staffPosition(pitch) + steps;
  const step = STEPS[((position % 7) + 7) % 7];
  return { step, alter: key ? keyAlter(key, step) : pitch.alter, octave: Math.floor(position / 7) };
}

export function isWithinOctaveRange(pitch: Pitch): boolean {
  return pitch.octave >= OCTAVE_RANGE.min && pitch.octave <= OCTAVE_RANGE.max;
}
