import { measureCapacity, type Meter } from "@/modules/score";
import type { SungNote } from "./notes";

/** A note (MIDI) or rest (null) placed on the beat grid, in quarter-note beats from the first note. */
export type PlacedNote = { midi: number | null; start: number; beats: number };
export type BarEvent = { midi: number | null; beats: number };

const GRID = 0.25;
const EIGHTH = 0.5;
/** Onsets this close to a beat (or an eighth) snap there rather than to a finer position. */
const PREFER_BEAT_WITHIN = 0.15;
const PREFER_EIGHTH_WITHIN = 0.1;
/** Gaps shorter than an eighth are singers breathing between legato notes, not rests. */
const MIN_REST = 0.5;
/** A note followed by a rest is written to the next beat if it is at least this long (beats). */
const HOLD_TO_BEAT = 0.4;
/** Sung phrases without a spoken tempo are read between these. */
const TEMPO_RANGE = { min: 60, max: 160 };
const WRITABLE = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];

/** Beat first, then eighth, then sixteenth: the coarsest grid point that is close enough. */
const snap = (beats: number) => {
  const beat = Math.round(beats);
  if (Math.abs(beats - beat) <= PREFER_BEAT_WITHIN) return beat;
  const eighth = Math.round(beats / EIGHTH) * EIGHTH;
  return Math.abs(beats - eighth) <= PREFER_EIGHTH_WITHIN ? eighth : Math.round(beats / GRID) * GRID;
};

export type TempoCandidate = { bpm: number; cost: number };
/** Candidates closer than this (BPM) are the same reading; only the better one is kept. */
const DISTINCT_TEMPI = 8;

/**
 * How badly each tempo (BPM) fits the sung onsets: distance from an eighth/sixteenth grid, with
 * a mild preference for moderate tempi so a phrase isn't read at double or half speed.
 * `range` limits the search, e.g. to a spoken marking ("Allegro" → 120–156).
 */
export function tempoCosts(notes: SungNote[], range: { min: number; max: number } = TEMPO_RANGE): TempoCandidate[] {
  const onsets = notes.map((n) => n.start - (notes[0]?.start ?? 0));
  const costs: TempoCandidate[] = [];
  for (let bpm = Math.ceil(range.min); bpm <= range.max; bpm++) {
    const beat = 60 / bpm;
    const error = onsets.reduce((sum, t) => sum + (t / beat - Math.round(t / beat / GRID) * GRID) ** 2, 0);
    const fineness = onsets.filter((t) => Math.abs(t / beat - Math.round(t / beat / EIGHTH) * EIGHTH) > 0.08).length;
    costs.push({ bpm, cost: error * 40 + fineness * 0.3 + Math.abs(Math.log2(bpm / 96)) * 0.5 });
  }
  return costs;
}

/** Candidate tempi best first, keeping only readings at least a few BPM apart. */
export function distinctTempi(costs: TempoCandidate[]): TempoCandidate[] {
  const ranked: TempoCandidate[] = [];
  for (const candidate of [...costs].sort((a, b) => a.cost - b.cost)) {
    if (ranked.every((r) => Math.abs(r.bpm - candidate.bpm) >= DISTINCT_TEMPI)) ranked.push(candidate);
  }
  return ranked;
}

/** Tempi (BPM) for a sung phrase, best first. */
export function rankTempi(notes: SungNote[], range: { min: number; max: number } = TEMPO_RANGE): TempoCandidate[] {
  if (notes.length < 2) return [{ bpm: Math.round((range.min + range.max) / 2), cost: Infinity }];
  return distinctTempi(tempoCosts(notes, range));
}

/** The most likely tempo (BPM) of a sung phrase. */
export const estimateTempo = (notes: SungNote[]) => rankTempi(notes)[0].bpm;

/**
 * Places sung notes on the beat grid: onsets snap to eighths (or sixteenths when clearly
 * meant), each note lasts until the next unless there is a real gap, and gaps become rests.
 */
export function quantizeNotes(notes: SungNote[], bpm: number): PlacedNote[] {
  if (!notes.length) return [];
  const beat = 60 / bpm;
  const origin = notes[0].start;
  const onsets: number[] = [];
  for (const note of notes) {
    const onset = snap((note.start - origin) / beat);
    onsets.push(onsets.length && onset <= onsets.at(-1)! ? onsets.at(-1)! + GRID : onset);
  }
  const placed: PlacedNote[] = [];
  notes.forEach((note, i) => {
    const next = onsets[i + 1];
    let end = Math.max(onsets[i] + GRID, snap((note.end - origin) / beat));
    if (next !== undefined && next - end < MIN_REST) end = next;
    // Before a rest (or at the end), a musician writes the note to the next beat: quarter + rest,
    // not eighth + dotted rest.
    const toBeat = Math.ceil(end - 1e-9);
    if (end - onsets[i] >= HOLD_TO_BEAT && (next === undefined || next >= toBeat)) end = Math.max(end, toBeat);
    if (next !== undefined) end = Math.min(end, next);
    placed.push({ midi: Math.round(note.midi), start: onsets[i], beats: end - onsets[i] });
    if (next !== undefined && next > end) placed.push({ midi: null, start: end, beats: next - end });
  });
  return placed;
}

/** The fewest writable values adding up to `beats` (largest first). */
function writableParts(beats: number): number[] {
  const parts: number[] = [];
  let remaining = beats;
  while (remaining > 1e-9) {
    const value = WRITABLE.find((v) => v <= remaining + 1e-9) ?? GRID;
    parts.push(value);
    remaining -= value;
  }
  return parts;
}

/**
 * Lays placed notes into bars of `meter`. A note crossing a barline, or with an unwritable
 * length, is split into re-struck notes (ties are not supported yet) and reported in `warnings`.
 * The last bar is completed with rests.
 */
export function toBars(placed: PlacedNote[], meter: Meter): { bars: BarEvent[][]; warnings: string[] } {
  const capacity = measureCapacity(meter);
  const bars: BarEvent[][] = [[]];
  let used = 0;
  let split = 0;
  for (const item of placed) {
    let remaining = item.beats;
    let pieces = 0;
    while (remaining > 1e-9) {
      if (used >= capacity - 1e-9) {
        bars.push([]);
        used = 0;
      }
      const portion = Math.min(remaining, capacity - used);
      for (const part of writableParts(portion)) {
        bars[bars.length - 1].push({ midi: item.midi, beats: part });
        pieces++;
      }
      used += portion;
      remaining -= portion;
    }
    if (item.midi !== null && pieces > 1) split++;
  }
  if (used < capacity)
    for (const part of writableParts(capacity - used)) bars[bars.length - 1].push({ midi: null, beats: part });
  const warnings = split
    ? [`${split} note${split > 1 ? "s were" : " was"} split into shorter notes; ties are not supported yet.`]
    : [];
  return { bars, warnings };
}
