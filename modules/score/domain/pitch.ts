import { keyAlter } from "./key";
import type { KeySignature, Pitch } from "./schema";

export const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Step = (typeof STEPS)[number];

/** A pitch's shape, without depending on the schema (whose pitch check uses these functions). */
type PitchShape = { step: Step; alter: number; octave: number };

/** Every stored pitch lies between A0 and C8 (MIDI), the piano keyboard; octaves run 0–8. */
export const PITCH_RANGE = { low: 21, high: 108 } as const;
export const OCTAVE_RANGE = { min: 0, max: 8 } as const;

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

export function midiPitch(pitch: PitchShape): number {
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

/** Whether a pitch can be stored at all: A0 to C8. */
export function isWithinPitchRange(pitch: PitchShape): boolean {
  const midi = midiPitch(pitch);
  return midi >= PITCH_RANGE.low && midi <= PITCH_RANGE.high;
}

/** The same written note: letter, accidental and octave. */
export const samePitch = (a: PitchShape | null, b: PitchShape | null) =>
  !!a && !!b && a.step === b.step && a.alter === b.alter && a.octave === b.octave;
