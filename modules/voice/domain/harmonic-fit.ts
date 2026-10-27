import { CHORD_QUALITIES, measureCapacity, pitchClass, type KeySignature, type Meter } from "@/modules/score";
import { rankKeysForMelody, tuneToScale, type ChordContext, type ResolvedNote } from "./musical-priors";
import type { SungNote } from "./notes";

export type HarmonicFit = {
  /** Semitones the take was moved to sit in the key (singers rarely start on the written pitch). */
  transposedBy: number;
  /** Where the first sung note falls in the first bar, in quarter beats. */
  startBeat: number;
  /** False when `startBeat` was inferred and other positions fit nearly as well. */
  startBeatSure: boolean;
  /** The take, transposed and with the singer's tuning removed. */
  notes: SungNote[];
};

/**
 * Transpositions tried, in tenths of a semitone: the singer's own tuning is part of the shift, so
 * a take sung 70 cents sharp of A is moved to D as a whole, not re-read note by note.
 */
const SHIFT_STEP = 0.1;
const SHIFTS = Array.from({ length: 12 / SHIFT_STEP }, (_, i) => Math.round((i * SHIFT_STEP - 6) * 10) / 10);
const START_STEP = 0.5;
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** How much the key's tonal weighting (tonic, dominant) counts next to plain scale membership. */
const PROFILE_WEIGHT = 0.5;
/** Among equally good fits, prefer the take as sung and the singing starting on the downbeat. */
const SHIFT_COST = 0.01;
const START_COST = 0.005;
/** The best start must beat the next by this much (chord fit, 0–1) to count as found. */
const START_MARGIN = 0.03;

export const chordTones = (chord: ChordContext) => {
  const root = pitchClass(chord.root);
  const tones = CHORD_QUALITIES[chord.quality].map((interval: number) => (root + interval) % 12);
  return chord.bass ? [...tones, pitchClass(chord.bass)] : tones;
};

/** The chord sounding at `beat` (quarter beats from the start of the first bar). */
export function chordAt(chords: ChordContext[], beat: number): ChordContext | undefined {
  return [...chords].sort((a, b) => a.beat - b.beat).findLast((c) => c.beat <= beat + 1e-9);
}

/** Semitones from a sung pitch (fractional MIDI) to the nearest pitch class in `tones`. */
function distanceToTones(midi: number, tones: number[]): number {
  return Math.min(...tones.map((tone) => Math.abs(((((midi - tone) % 12) + 18) % 12) - 6)));
}

/** How closely the sung time sits on the key's scale, 0–1 (half a semitone off counts as 0). */
function scaleFit(notes: SungNote[], key: KeySignature): number {
  const tonic = (((key.fifths * 7) % 12) + 12) % 12;
  const scale = MAJOR_SCALE.map((step) => (tonic + step) % 12);
  let fitting = 0;
  let total = 0;
  for (const note of notes) {
    const length = note.end - note.start;
    total += length;
    fitting += length * Math.max(0, 1 - 2 * distanceToTones(note.midi, scale));
  }
  return total ? fitting / total : 0;
}

/**
 * How closely the sung time sits on tones of the chord underneath, 0–1. Measured as a distance,
 * not after rounding, so a singer a little off still counts as aiming for the chord tone.
 */
function chordFit(notes: SungNote[], onsets: number[], chords: ChordContext[], startBeat: number): number {
  let fitting = 0;
  let total = 0;
  notes.forEach((note, i) => {
    const chord = chordAt(chords, onsets[i] + startBeat);
    const length = note.end - note.start;
    total += length;
    if (chord) fitting += length * Math.max(0, 1 - distanceToTones(note.midi, chordTones(chord)));
  });
  return total ? fitting / total : 0;
}

/**
 * Places a take in the music the musician asked for. Nobody sings from a reference pitch, so a
 * tune meant in D is often sung in A, and between semitones: every transposition (in tenths of a
 * semitone) is tried, scored by how closely the notes sit on the key's scale and, when known,
 * on the chords under them. Drift within the take is then followed against the key. With chords, the bar position of the first
 * note is found the same way (a phrase starting after an eighth rest fits its chords only when
 * placed there). `onsets` are the notes' quantized starts in beats from the first note.
 */
export function fitHarmony(
  notes: SungNote[],
  onsets: number[],
  key: KeySignature,
  options: { meter: Meter; chords?: ChordContext[]; startBeat?: number },
): HarmonicFit {
  const chords = options.chords ?? [];
  const capacity = measureCapacity(options.meter);
  const starts =
    options.startBeat !== undefined || !chords.length
      ? [options.startBeat ?? 0]
      : Array.from({ length: Math.round(capacity / START_STEP) }, (_, i) => i * START_STEP);
  let best = { score: -Infinity, shift: 0, startBeat: starts[0] };
  const bestPerStart = new Map<number, number>();
  for (const shift of SHIFTS) {
    const shifted = notes.map((n) => ({ ...n, midi: n.midi + shift }));
    const profile = rankKeysForMelody(shifted).find((c) => sameKey(c.key, key))?.score ?? -1;
    const inKey = scaleFit(shifted, key) + PROFILE_WEIGHT * profile - SHIFT_COST * Math.abs(shift);
    for (const startBeat of starts) {
      const harmony = chords.length ? chordFit(shifted, onsets, chords, startBeat) : 0;
      const score = inKey + harmony - START_COST * startBeat;
      bestPerStart.set(startBeat, Math.max(bestPerStart.get(startBeat) ?? -Infinity, score));
      if (score > best.score) best = { score, shift, startBeat };
    }
  }
  const runnerUp = Math.max(...[...bestPerStart].filter(([start]) => start !== best.startBeat).map(([, s]) => s));
  const shifted = notes.map((n) => ({ ...n, midi: n.midi + best.shift }));
  return {
    transposedBy: Math.round(best.shift),
    startBeat: best.startBeat,
    startBeatSure: options.startBeat !== undefined || best.score - runnerUp >= START_MARGIN,
    notes: tuneToScale(shifted, key),
  };
}

const sameKey = (a: KeySignature, b: KeySignature) => a.fifths === b.fifths && a.mode === b.mode;

/**
 * Where the singer landed between two pitches, takes the one in the chord sounding at that
 * moment: someone singing over C who lands between E and F meant E. `onsets` are the notes'
 * written starts, in beats from the start of the first bar. Clear pitches are left alone, so passing notes
 * and deliberate tensions survive.
 */
export function fitToChords(notes: ResolvedNote[], onsets: number[], chords: ChordContext[]): ResolvedNote[] {
  return notes.map((note, i) => {
    const chord = chordAt(chords, onsets[i]);
    if (note.alternative === null || !chord) return note;
    const tones = chordTones(chord);
    const isTone = (midi: number) => tones.includes(((midi % 12) + 12) % 12);
    return !isTone(note.pitch) && isTone(note.alternative)
      ? { ...note, pitch: note.alternative, alternative: note.pitch }
      : note;
  });
}

/** A note this close (semitones) to a chord tone is taken as that tone when snapping. */
const SNAP_REACH = 1;
/** A singer drifting within one chord is re-centred by at most this much (semitones). */
const CHORD_RETUNE_LIMIT = 1;
const CHORD_RETUNE_COST = 0.05;

/** The tuning correction (semitones) that puts one chord's notes closest to its tones. */
function chordRetune(notes: ResolvedNote[], tones: number[]): number {
  let best = { cost: Infinity, offset: 0 };
  for (let tenth = -CHORD_RETUNE_LIMIT * 10; tenth <= CHORD_RETUNE_LIMIT * 10; tenth++) {
    const offset = tenth / 10;
    const miss = notes.reduce((sum, n) => sum + (n.end - n.start) * distanceToTones(n.midi + offset, tones), 0);
    const cost = miss + CHORD_RETUNE_COST * Math.abs(offset);
    if (cost < best.cost) best = { cost, offset };
  }
  return best.offset;
}

/**
 * For tunes built from chord tones (arpeggios, riffs): the notes under each chord are re-centred
 * on its tones (singers drift within a phrase), then each note within a semitone of a chord tone
 * becomes that tone, as a musician hearing a rough arpeggio would write it. The note as first
 * read is kept as the alternative.
 */
export function snapToChordTones(notes: ResolvedNote[], onsets: number[], chords: ChordContext[]): ResolvedNote[] {
  const chordOf = notes.map((_, i) => chordAt(chords, onsets[i]));
  const retune = new Map<ChordContext, number>();
  for (const chord of new Set(chordOf)) {
    if (chord)
      retune.set(
        chord,
        chordRetune(
          notes.filter((_, i) => chordOf[i] === chord),
          chordTones(chord),
        ),
      );
  }
  return notes.map((note, i) => {
    const chord = chordOf[i];
    if (!chord) return note;
    const tones = chordTones(chord);
    const midi = note.midi + (retune.get(chord) ?? 0);
    const target = [-1, 0, 1]
      .map((step) => Math.round(midi) + step)
      .filter((candidate) => tones.includes(((candidate % 12) + 12) % 12) && Math.abs(candidate - midi) <= SNAP_REACH)
      .sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi))[0];
    if (target === undefined || target === note.pitch) return note;
    return { ...note, pitch: target, alternative: note.pitch };
  });
}
