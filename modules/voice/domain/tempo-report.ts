import { DEFAULT_WEIGHTS, readRhythm, typicalTempo, type RhythmOptions } from "./tempo-map";

/** How a double- or half-time reading of the same singing compares with the best one. */
export type TempoAlternative = { bpm: number; fit: "about as likely" | "less likely" | "unlikely" };

export type TempoReport = {
  /** The typical tempo of the singing (BPM). */
  bpm: number;
  /** The slowest and fastest local tempo: how much the singer drifted. */
  drift: [number, number];
  alternatives: TempoAlternative[];
};

/** A reading this much costlier (negative log-likelihood) is "less likely", and beyond the next "unlikely". */
const ABOUT_AS_LIKELY = 3;
const LESS_LIKELY = 10;
/** An alternative tempo is searched within this ratio of its exact double or half. */
const ALTERNATIVE_SPREAD = 1.15;

/**
 * The tempo of one or more sung stretches (onsets in seconds, one list per stretch), read with a
 * beat that may drift, plus how well the same singing fits double and half the tempo: the reading
 * a musician might doubt, which only their words or the style can settle. Hints (spoken tempo,
 * bars, a tempo word's range) apply to every stretch.
 */
export function reportTempo(spans: number[][], options: RhythmOptions): TempoReport {
  const usable = spans.filter((onsets) => onsets.length >= 2);
  if (!usable.length) return { bpm: options.bpm ?? 0, drift: [0, 0], alternatives: [] };
  const best = usable.map((onsets) => readRhythm(onsets, options));
  const tempi = best.flatMap((reading) => reading.tempi).sort((a, b) => a - b);
  const bpm = typicalTempo({ positions: [], tempi, cost: 0 });
  // Readings are compared by how well the timing fits alone: no tempo is preferred, and neither
  // are on-beat positions (a faster reading always puts more notes on beats).
  const weights = { ...(options.weights ?? DEFAULT_WEIGHTS), moderateTempo: Infinity, offbeat: 0, sixteenth: 0 };
  const judged = { ...options, bpm: undefined, weights };
  const costNear = (target: number) => {
    const range = { min: target / ALTERNATIVE_SPREAD, max: target * ALTERNATIVE_SPREAD };
    return usable.reduce((sum, onsets) => sum + readRhythm(onsets, { ...judged, range }).cost, 0);
  };
  const cost = costNear(bpm);
  const alternatives = [bpm * 2, bpm / 2].map((target): TempoAlternative => {
    const extra = costNear(target) - cost;
    const fit = extra < ABOUT_AS_LIKELY ? "about as likely" : extra < LESS_LIKELY ? "less likely" : "unlikely";
    return { bpm: Math.round(target), fit };
  });
  return { bpm, drift: [tempi[0], tempi.at(-1)!], alternatives };
}
