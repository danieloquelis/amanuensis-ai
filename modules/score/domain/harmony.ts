import { CHORD_QUALITIES, pitchClass, type ChordQuality, type ChordRoot } from "./chords";
import { keyName } from "./key";
import type { KeySignature } from "./schema";

export type ChordSymbol = { root: ChordRoot; quality: ChordQuality; bass?: ChordRoot };

export type KeyCandidate = {
  key: KeySignature;
  name: string;
  /** Higher is a better fit; comparable only within one ranking. */
  score: number;
  /** Plain-language reasons a musician would accept ("A → D is V → I"). */
  evidence: string[];
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const DOMINANT = 7;
const LEADING_TONE = 11;
/** Every distinct key signature once (D♭ … F♯), in both modes. */
const SIGNATURES = Array.from({ length: 12 }, (_, i) => i - 5);
/** Weights: each chord that belongs to the key counts 1; tonal landmarks break ties. */
const TONIC_PRESENT = 0.3;
const STARTS_ON_TONIC = 0.2;
const ENDS_ON_TONIC = 0.3;
const CADENCE = 0.4;

const tonicOf = (key: KeySignature) => (((key.fifths * 7) % 12) + 12 + (key.mode === "minor" ? 9 : 0)) % 12;

function chordTones(chord: ChordSymbol): number[] {
  const root = pitchClass(chord.root);
  const tones = CHORD_QUALITIES[chord.quality].map((interval: number) => (root + interval) % 12);
  return chord.bass ? [...tones, pitchClass(chord.bass)] : tones;
}

const hasMajorThird = (chord: ChordSymbol) => (CHORD_QUALITIES[chord.quality] as readonly number[]).includes(4);
const hasMinorThird = (chord: ChordSymbol) => (CHORD_QUALITIES[chord.quality] as readonly number[]).includes(3);

/**
 * A chord belongs to a key when all its notes are in the scale. In minor, the dominant and
 * leading-tone chords may also use the raised 7th (E7 in A minor), as harmonic minor does.
 */
function belongs(chord: ChordSymbol, tonic: number, mode: KeySignature["mode"]): boolean {
  const degree = (pitchClass(chord.root) - tonic + 12) % 12;
  const scale = mode === "major" ? MAJOR_SCALE : NATURAL_MINOR;
  const allowed = new Set(scale.map((step) => (tonic + step) % 12));
  if (mode === "minor" && (degree === DOMINANT || degree === LEADING_TONE)) allowed.add((tonic + LEADING_TONE) % 12);
  return chordTones(chord).every((tone) => allowed.has(tone));
}

function isTonicChord(chord: ChordSymbol, tonic: number, mode: KeySignature["mode"]): boolean {
  if (pitchClass(chord.root) !== tonic) return false;
  return mode === "major" ? hasMajorThird(chord) : hasMinorThird(chord);
}

/** A major (or dominant 7th) chord on the 5th resolving to the tonic: V → I. */
function cadences(chords: ChordSymbol[], tonic: number, mode: KeySignature["mode"]): number {
  let count = 0;
  for (let i = 1; i < chords.length; i++) {
    const dominant = pitchClass(chords[i - 1].root) === (tonic + DOMINANT) % 12 && hasMajorThird(chords[i - 1]);
    if (dominant && isTonicChord(chords[i], tonic, mode)) count++;
  }
  return count;
}

/**
 * Ranks keys for a chord progression, as a musician would: the key whose scale holds the most
 * chords, then the one the progression leans on (its tonic chord, where it starts and ends,
 * V → I cadences). Em A D G → D major: all four are in D, and A → D is V → I.
 * Relative keys (D major / B minor) share a signature; when they tie, ask.
 */
export function rankKeysForChords(chords: ChordSymbol[]): KeyCandidate[] {
  if (!chords.length) return [];
  const candidates = SIGNATURES.flatMap((fifths) =>
    (["major", "minor"] as const).map((mode): KeyCandidate => {
      const key: KeySignature = { fifths, mode };
      const tonic = tonicOf(key);
      const inKey = chords.filter((c) => belongs(c, tonic, mode)).length;
      const evidence = [`${inKey} of ${chords.length} chords are in the key`];
      let score = inKey;
      if (chords.some((c) => isTonicChord(c, tonic, mode))) {
        score += TONIC_PRESENT;
        evidence.push("its tonic chord is played");
      }
      if (isTonicChord(chords[0], tonic, mode)) {
        score += STARTS_ON_TONIC;
        evidence.push("starts on the tonic");
      }
      if (chords.length > 1 && isTonicChord(chords.at(-1)!, tonic, mode)) {
        score += ENDS_ON_TONIC;
        evidence.push("ends on the tonic");
      }
      const resolved = cadences(chords, tonic, mode);
      if (resolved) {
        score += CADENCE * resolved;
        evidence.push(`V → I cadence${resolved > 1 ? ` ×${resolved}` : ""}`);
      }
      return { key, name: keyName(key), score: Math.round(score * 100) / 100, evidence };
    }),
  );
  return candidates.sort((a, b) => b.score - a.score);
}
