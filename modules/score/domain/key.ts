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
