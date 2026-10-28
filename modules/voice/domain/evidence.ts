import type { ResolvedNote } from "./musical-priors";

/** What the ear can say about one written bar, for the agent to judge it like a musician. */
export type BarEvidence = {
  bar: number;
  /** How surely the written pitches match what was sung. */
  confidence: "high" | "medium" | "low";
  /** Average distance (cents) between what was sung and what is written. */
  offCents: number;
  /** Written pitches that differ from what was sung by more than a quarter tone: corrections. */
  corrected: number;
  /** Other bars sharing most of this bar's note onsets: likely one figure repeated over each chord. */
  similarRhythm: number[];
};

/** Notes this far from their written pitch (cents, on average) still read as clearly sung. */
const CLEAR_CENTS = 25;
const ROUGH_CENTS = 45;
/** A written pitch more than this far from what was sung (cents) was a correction, not a hearing. */
const CORRECTED_CENTS = 50;
/** Bars sharing at least this share of their onsets (Jaccard) have a similar rhythm. */
const SIMILAR_RHYTHM = 0.6;

/** Where notes start in each bar, in beats from the barline. */
function onsetSets(bars: { midi: number | null; beats: number }[][]): Set<number>[] {
  return bars.map((bar) => {
    const starts = new Set<number>();
    let beat = 0;
    for (const event of bar) {
      if (event.midi !== null) starts.add(beat);
      beat += event.beats;
    }
    return starts;
  });
}

function similarity(a: Set<number>, b: Set<number>): number {
  const shared = [...a].filter((x) => b.has(x)).length;
  const all = new Set([...a, ...b]).size;
  return all ? shared / all : 0;
}

export function barEvidence(
  notes: ResolvedNote[],
  onsets: number[],
  bars: { midi: number | null; beats: number }[][],
  capacity: number,
): BarEvidence[] {
  const rhythm = onsetSets(bars);
  return bars.map((_, index) => {
    const inBar = notes.filter((__, i) => Math.floor(onsets[i] / capacity) === index);
    const misses = inBar.map((n) => Math.abs(n.midi - n.pitch) * 100);
    const offCents = misses.length ? Math.round(misses.reduce((sum, m) => sum + m, 0) / misses.length) : 0;
    const corrected = misses.filter((m) => m > CORRECTED_CENTS).length;
    const confidence =
      offCents > ROUGH_CENTS || corrected >= 2 ? "low" : offCents > CLEAR_CENTS || corrected ? "medium" : "high";
    const similarRhythm = rhythm.flatMap((r, other) =>
      other !== index && rhythm[index].size > 1 && similarity(r, rhythm[index]) >= SIMILAR_RHYTHM ? [other + 1] : [],
    );
    return { bar: index + 1, confidence, offCents, corrected, similarRhythm };
  });
}
