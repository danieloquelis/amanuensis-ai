import type { Step } from "./pitch";
import type { KeySignature, Pitch, Score } from "./schema";

export const KEY_FIFTHS = { min: -7, max: 7 } as const;
export const C_MAJOR: KeySignature = { fifths: 0, mode: "major" };

/** Order in which sharps (and, reversed, flats) enter a key signature. */
export const SHARP_ORDER: readonly Step[] = ["F", "C", "G", "D", "A", "E", "B"];
export const FLAT_ORDER: readonly Step[] = ["B", "E", "A", "D", "G", "C", "F"];

const MAJOR_TONICS = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const MINOR_TONICS = ["A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯"];

export const scoreKey = (score: Pick<Score, "key">): KeySignature => score.key ?? C_MAJOR;

/** The alteration a key signature implies for a step: -1, 0 or 1. */
export function keyAlter(key: KeySignature, step: Step): -1 | 0 | 1 {
  if (key.fifths > 0 && SHARP_ORDER.slice(0, key.fifths).includes(step)) return 1;
  if (key.fifths < 0 && FLAT_ORDER.slice(0, -key.fifths).includes(step)) return -1;
  return 0;
}

/** Steps carried by the signature, in engraving order, with their alteration. */
export function keySignatureSteps(key: KeySignature): { step: Step; alter: -1 | 1 }[] {
  if (key.fifths > 0) return SHARP_ORDER.slice(0, key.fifths).map((step) => ({ step, alter: 1 }));
  return FLAT_ORDER.slice(0, -key.fifths).map((step) => ({ step, alter: -1 }));
}

/** "D major", "B♭ minor". */
export function keyName(key: KeySignature): string {
  const tonics = key.mode === "major" ? MAJOR_TONICS : MINOR_TONICS;
  return `${tonics[key.fifths - KEY_FIFTHS.min]} ${key.mode}`;
}

/** Same step and octave, spelled as the key signature implies. */
export function inKey(pitch: Pitch, key: KeySignature): Pitch {
  return { ...pitch, alter: keyAlter(key, pitch.step) };
}

const NATURAL_PITCH_CLASSES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEP_ORDER: Step[] = ["C", "D", "E", "F", "G", "A", "B"];

/**
 * Spells a MIDI note in a key: the key's own spelling when it has one (F♯ in D major), otherwise
 * sharps in sharp keys and flats in flat keys; in C, B♭ and E♭ as flats and other black keys as sharps.
 */
export function spellMidi(midi: number, key: KeySignature): Pitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const candidates = STEP_ORDER.flatMap((step) =>
    ([-1, 0, 1] as const)
      .filter((alter) => (NATURAL_PITCH_CLASSES[step] + alter + 12) % 12 === pitchClass)
      .map((alter) => ({ step, alter })),
  );
  const inKeySpelling = candidates.find((c) => keyAlter(key, c.step) === c.alter);
  const natural = candidates.find((c) => c.alter === 0);
  const preferFlat = key.fifths < 0 || (key.fifths === 0 && (pitchClass === 10 || pitchClass === 3));
  const accidental = candidates.find((c) => c.alter === (preferFlat ? -1 : 1));
  const { step, alter } = inKeySpelling ?? natural ?? accidental ?? candidates[0];
  // B♯/C♭ cross the octave boundary: octave follows the written letter.
  const octave = Math.floor((midi - alter) / 12) - 1;
  return { step, alter, octave };
}
