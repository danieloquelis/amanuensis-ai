/**
 * Reading performed timing as written rhythm, the way a musician hears it: a beat that drifts
 * a little from note to note (singers rush and relax), notes on simple metrical positions, and
 * a breath allowed at the barline. A Viterbi search over (position on the sixteenth grid, local
 * tempo) finds the most likely reading of the onsets; the result is a tempo map.
 */

/** Steps between onsets the reading may use, in sixteenths (a sixteenth up to a whole bar). */
const STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const SIXTEENTHS_PER_BEAT = 4;
/** Tempo states are this ratio apart (2%), from the slowest to the fastest reading. */
const TEMPO_RATIO = 1.02;
const TEMPO_LIMITS = { min: 40, max: 200 };
/** How far the beat may move from one note to the next, in tempo states. */
const MAX_TEMPO_STEP = 3;

/**
 * How the costs weigh evidence, as spreads of log-ratios (a singer's timing is off by about
 * 10% note to note) and penalties for metrically weaker positions. Tuned against labelled takes.
 */
export type RhythmWeights = {
  /** Spread of an onset's timing against the reading (log-ratio). */
  timing: number;
  /** Extra time the singer may take before a downbeat (a breath at the barline). */
  barlineBreath: number;
  /** Spread of the tempo change from one note to the next (log-ratio). */
  drift: number;
  /** Cost of the phrase not starting on the downbeat (a pickup): possible, but less likely. */
  pickup: number;
  /** Cost of a note starting off the beat on an eighth, and on a sixteenth. */
  offbeat: number;
  sixteenth: number;
  /** Spread of the tempo around the spoken tempo (log-ratio), and around a moderate one when none was said. */
  tempoHint: number;
  moderateTempo: number;
};

export const DEFAULT_WEIGHTS: RhythmWeights = {
  timing: 0.12,
  barlineBreath: 0.3,
  pickup: 1,
  drift: 0.04,
  offbeat: 0.6,
  sixteenth: 1.6,
  tempoHint: 0.25,
  moderateTempo: 0.4,
};

/**
 * With no spoken tempo, readings near this one are preferred: a beat of about 0.6 s is the one
 * listeners feel most readily, which breaks double/half-tempo ties.
 */
const MODERATE_BPM = 96;

export type RhythmOptions = {
  /** Beats per bar (4 for 4/4). */
  barBeats: number;
  /** Spoken tempo, if any. */
  bpm?: number;
  /** Where the first onset falls in bar 1 (beats); every position is tried if omitted. */
  startBeat?: number;
  /** The reading must fit in this many bars, when the musician said how many. */
  bars?: number;
  /** Only tempi in this range (BPM) are considered, e.g. to weigh a double-time reading. */
  range?: { min: number; max: number };
  weights?: RhythmWeights;
};

export type RhythmReading = {
  /** Each onset's position in beats from the first barline. */
  positions: number[];
  /** The local tempo (BPM) at each onset: the tempo map. */
  tempi: number[];
  /** How unlikely the reading is (lower is better); comparable between readings of one take. */
  cost: number;
};

const tempoOf = (k: number) => TEMPO_LIMITS.min * TEMPO_RATIO ** k;
const TEMPO_STATES = Math.floor(Math.log(TEMPO_LIMITS.max / TEMPO_LIMITS.min) / Math.log(TEMPO_RATIO)) + 1;

/** Cost of a note landing on this sixteenth of the bar. */
function positionCost(sixteenth: number, barSixteenths: number, weights: RhythmWeights): number {
  const inBar = sixteenth % barSixteenths;
  if (inBar % SIXTEENTHS_PER_BEAT === 0) return 0;
  return inBar % 2 === 0 ? weights.offbeat : weights.sixteenth;
}

/** Cost of hearing `seconds` as `sixteenths` at `bpm`; a late downbeat is a breath, cheaper. */
function timingCost(seconds: number, sixteenths: number, bpm: number, toDownbeat: boolean, weights: RhythmWeights) {
  const expected = (sixteenths / SIXTEENTHS_PER_BEAT) * (60 / bpm);
  const error = Math.log(Math.max(seconds, 1e-3) / expected);
  const spread = toDownbeat && error > 0 ? weights.barlineBreath : weights.timing;
  return (error * error) / (2 * spread * spread);
}

/** The most likely written reading of `onsets` (seconds, ascending). */
export function readRhythm(onsets: number[], options: RhythmOptions): RhythmReading {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const bar = options.barBeats * SIXTEENTHS_PER_BEAT;
  const span = onsets.at(-1)! - onsets[0];
  const longestBars = Math.ceil(span / (60 / TEMPO_LIMITS.max) / options.barBeats) + 1;
  const positions = (options.bars ?? longestBars) * bar;
  const states = positions * TEMPO_STATES;
  // The tempo prior holds at every note, so a long take can't drift to double or half speed.
  const hint = options.bpm ?? MODERATE_BPM;
  const hintSpread = options.bpm ? weights.tempoHint : weights.moderateTempo;
  const range = options.range ?? TEMPO_LIMITS;
  const tempoPrior = Array.from({ length: TEMPO_STATES }, (_, k) => {
    if (tempoOf(k) < range.min || tempoOf(k) > range.max) return Infinity;
    const off = Math.log(tempoOf(k) / hint);
    return (off * off) / (2 * hintSpread * hintSpread);
  });

  let cost = new Float64Array(states).fill(Infinity);
  const starts = options.startBeat !== undefined ? [Math.round(options.startBeat * SIXTEENTHS_PER_BEAT)] : [];
  for (let g = 0; g < bar; g++) {
    if (starts.length && !starts.includes(g)) continue;
    const start = positionCost(g, bar, weights) + (g ? weights.pickup : 0);
    for (let k = 0; k < TEMPO_STATES; k++) cost[g * TEMPO_STATES + k] = start + tempoPrior[k];
  }
  const back: Int32Array[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const seconds = onsets[i] - onsets[i - 1];
    const next = new Float64Array(states).fill(Infinity);
    const from = new Int32Array(states).fill(-1);
    for (let g = 0; g < positions; g++) {
      for (let k = 0; k < TEMPO_STATES; k++) {
        const here = cost[g * TEMPO_STATES + k];
        if (here === Infinity) continue;
        for (const step of STEPS) {
          const target = g + step;
          if (target >= positions) break;
          const landing = here + positionCost(target, bar, weights);
          const toDownbeat = target % bar === 0;
          for (let dk = -MAX_TEMPO_STEP; dk <= MAX_TEMPO_STEP; dk++) {
            const k2 = k + dk;
            if (k2 < 0 || k2 >= TEMPO_STATES || tempoPrior[k2] === Infinity) continue;
            const drift = (dk * Math.log(TEMPO_RATIO)) / weights.drift;
            const timing = timingCost(seconds, step, tempoOf(k2), toDownbeat, weights);
            const total = landing + (drift * drift) / 2 + tempoPrior[k2] + timing;
            const index = target * TEMPO_STATES + k2;
            if (total < next[index]) {
              next[index] = total;
              from[index] = g * TEMPO_STATES + k;
            }
          }
        }
      }
    }
    back.push(from);
    cost = next;
  }
  let best = 0;
  for (let s = 1; s < states; s++) if (cost[s] < cost[best]) best = s;
  const path = [best];
  for (let i = back.length - 1; i >= 0; i--) path.unshift(back[i][path[0]]);
  return {
    positions: path.map((s) => Math.floor(s / TEMPO_STATES) / SIXTEENTHS_PER_BEAT),
    tempi: path.map((s) => Math.round(tempoOf(s % TEMPO_STATES))),
    cost: cost[best],
  };
}

/**
 * Where `time` (seconds) falls on the reading's beat, through the tempo map: between two onsets
 * the beat moves evenly, and after the last it keeps the last tempo.
 */
export function beatAt(onsets: number[], reading: RhythmReading, time: number): number {
  const { positions, tempi } = reading;
  const after = onsets.findIndex((onset) => onset > time);
  if (after === -1) return positions.at(-1)! + ((time - onsets.at(-1)!) * tempi.at(-1)!) / 60;
  if (after === 0) return positions[0] - ((onsets[0] - time) * tempi[0]) / 60;
  const share = (time - onsets[after - 1]) / (onsets[after] - onsets[after - 1]);
  return positions[after - 1] + share * (positions[after] - positions[after - 1]);
}

/** The reading's typical tempo: the median of its tempo map. */
export const typicalTempo = (reading: RhythmReading) =>
  [...reading.tempi].sort((a, b) => a - b)[Math.floor(reading.tempi.length / 2)];
