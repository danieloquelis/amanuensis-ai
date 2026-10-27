import { keyAlter, keyName, spellMidi, type Chord, type KeyCandidate, type KeySignature } from "@/modules/score";
import type { SungNote } from "./notes";

/** Krumhansl–Kessler key profiles: how strongly each scale degree implies a key. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
/** Circle-of-fifths position of each major tonic pitch class (C = 0, G = 1, F = −1…). */
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
/** Semitones of the major scale; every key signature is this set on some tonic. */
const DIATONIC = [0, 2, 4, 5, 7, 9, 11];
/** Tuning is followed over this many notes either side, so a drifting singer is tracked. */
const TUNING_NEIGHBOURS = 4;
/** A small preference for keys that need less retuning, to break ties. */
const RETUNING_COST = 0.1;
/** A note within this distance (semitones) of an in-key pitch is taken as that pitch. */
const IN_KEY_REACH = 0.7;
/** Notes further than this from the nearest semitone are ambiguous; their alternative is kept. */
const AMBIGUOUS = 0.3;

/** A chord sounding under the take from `beat` (quarter beats from the start of the first bar). */
export type ChordContext = Pick<Chord, "root" | "quality" | "bass"> & { beat: number };

export type ResolvedNote = SungNote & {
  /** The written pitch chosen (MIDI). */
  pitch: number;
  /** The other plausible pitch when the singer was between two, for the assistant to weigh. */
  alternative: number | null;
};

const pitchClass = (midi: number) => ((Math.round(midi) % 12) + 12) % 12;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** Pitch class of the major tonic for a signature: G (7) for one sharp, F (5) for one flat. */
const majorTonic = (key: KeySignature) => (((key.fifths * 7) % 12) + 12) % 12;

/** Signed distance (semitones) from a pitch to the nearest note of the major scale on `tonic`. */
function scaleResidual(midi: number, tonic: number): number {
  let best = Infinity;
  for (const degree of DIATONIC) {
    const distance = ((((midi - tonic - degree) % 12) + 18) % 12) - 6;
    if (Math.abs(distance) < Math.abs(best)) best = distance;
  }
  return best;
}

/**
 * Follows a drifting singer's tuning by measuring it against a scale rather than the semitone
 * grid. Against the grid, a singer drifting past 50 cents sharp suddenly reads as 50 flat and
 * every note jumps a semitone; against the scale the true key fits with a steady tuning, so
 * the scale whose residuals vary least is chosen and its tuning removed note by note.
 * With a known key only that scale is tried.
 */
export function tuneToScale(notes: SungNote[], key?: KeySignature): SungNote[] {
  if (!notes.length) return notes;
  const tonics = key ? [majorTonic(key)] : Array.from({ length: 12 }, (_, i) => i);
  let best = { cost: Infinity, tuning: notes.map(() => 0) };
  for (const tonic of tonics) {
    const residuals = notes.map((n) => scaleResidual(n.midi, tonic));
    const tuning = residuals.map((_, i) =>
      median(residuals.slice(Math.max(0, i - TUNING_NEIGHBOURS), i + TUNING_NEIGHBOURS + 1)),
    );
    const cost = residuals.reduce((sum, r, i) => sum + (r - tuning[i]) ** 2 + RETUNING_COST * tuning[i] ** 2, 0);
    if (cost < best.cost) best = { cost, tuning };
  }
  return notes.map((note, i) => {
    const midi = note.midi - best.tuning[i];
    return { ...note, midi, cents: Math.round((midi - Math.round(midi)) * 100) };
  });
}

function correlation(a: number[], b: number[]): number {
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const [ma, mb] = [mean(a), mean(b)];
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * Keys ranked by how well they explain the sung pitch classes, weighted by note length
 * (Krumhansl–Schmuckler). Scores are correlations, −1 to 1.
 */
export function rankKeysForMelody(notes: SungNote[]): KeyCandidate[] {
  const histogram = new Array(12).fill(0);
  for (const note of notes) histogram[pitchClass(note.midi)] += note.end - note.start;
  const candidates: KeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = (profile: number[]) => profile.map((_, i) => profile[(i - tonic + 12) % 12]);
    // A minor key shares its signature with the major key a minor third above.
    const keys: [KeySignature, number[]][] = [
      [{ fifths: MAJOR_FIFTHS[tonic], mode: "major" }, MAJOR_PROFILE],
      [{ fifths: MAJOR_FIFTHS[(tonic + 3) % 12], mode: "minor" }, MINOR_PROFILE],
    ];
    for (const [key, profile] of keys) {
      const score = Math.round(correlation(histogram, rotated(profile)) * 100) / 100;
      candidates.push({ key, name: keyName(key), score, evidence: ["fits the sung notes"] });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

/** The key that best explains the sung pitch classes. */
export const estimateKey = (notes: SungNote[]): KeySignature =>
  rankKeysForMelody(notes)[0]?.key ?? { fifths: 0, mode: "major" };

const inKey = (midi: number, key: KeySignature) => {
  const spelled = spellMidi(midi, key);
  return spelled.alter === keyAlter(key, spelled.step);
};

/**
 * Chooses each written pitch as a musician would hear it: the nearest semitone, unless the
 * singer was between two and only one belongs to the key. A pitch sung clearly on a chromatic
 * note stays chromatic. Ambiguous notes keep their alternative.
 */
export function resolvePitches(notes: SungNote[], key: KeySignature): ResolvedNote[] {
  return notes.map((note) => {
    const nearest = Math.round(note.midi);
    const other = note.midi >= nearest ? nearest + 1 : nearest - 1;
    let pitch = nearest;
    if (!inKey(nearest, key) && inKey(other, key) && Math.abs(note.midi - other) <= IN_KEY_REACH) pitch = other;
    const distance = Math.abs(note.midi - nearest);
    const alternative = distance > AMBIGUOUS ? (pitch === nearest ? other : nearest) : null;
    return { ...note, pitch, alternative };
  });
}
