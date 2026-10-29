import type { PitchFrame } from "./pitch-tracker";
import { singingFeatures } from "./singing-evidence";
import { SINGING_MODEL } from "./singing-model";
import type { SoundFrame } from "./spectrum";
import type { SpeechTurn } from "./take";

const FRAME_SECONDS = 0.01;
/** Probabilities are kept this far from 0 and 1 so that no single frame is ever certain. */
const FLOOR = 1e-6;
/** Sung phrases further apart than this (seconds of silence) are separate spans for the voice tools. */
const SPAN_GAP_SECONDS = 1.5;

/**
 * How likely a frame is sung, from its evidence (logistic regression on standardized features),
 * and how to read a whole take from those likelihoods: a two-state hidden Markov model (talk,
 * singing) in which switching costs a little at every 10 ms, during pauses too. Fitted by
 * `yarn fit:singing` on mixed takes built from real recordings, whose every moment's truth is known.
 */
export type SingingModel = {
  mean: number[];
  spread: number[];
  weights: number[];
  bias: number;
  /** Share of the training voice that was singing: the baseline the evidence moves from. */
  prior: number;
  /** How much one frame's evidence counts; neighbouring frames share most of theirs. */
  evidenceWeight: number;
  /** Chance, every 10 ms, of switching between talk and singing. */
  switchChance: number;
};

/** How likely each voiced frame is sung, from 0 to 1; null without voice. */
export function singingProbabilities(features: (number[] | null)[], model: SingingModel): (number | null)[] {
  return features.map((values) => {
    if (!values) return null;
    const sum = values.reduce(
      (total, value, f) => total + (model.weights[f] * (value - model.mean[f])) / model.spread[f],
      model.bias,
    );
    return 1 / (1 + Math.exp(-sum));
  });
}

/**
 * The most likely talk-or-singing reading of every frame (Viterbi). Frames without voice add
 * no evidence, so a pause is just time in which a switch becomes possible.
 */
export function decodeSinging(probabilities: (number | null)[], model: SingingModel): boolean[] {
  const { prior, evidenceWeight, switchChance } = model;
  const evidence = (p: number | null) => {
    if (p === null) return [0, 0];
    const q = Math.min(1 - FLOOR, Math.max(FLOOR, p));
    return [evidenceWeight * Math.log((1 - q) / (1 - prior)), evidenceWeight * Math.log(q / prior)];
  };
  const [stay, move] = [Math.log(1 - switchChance), Math.log(switchChance)];
  const first = evidence(probabilities[0] ?? null);
  let score = [first[0] + Math.log(1 - prior), first[1] + Math.log(prior)];
  const cameFrom: number[][] = [];
  for (let t = 1; t < probabilities.length; t++) {
    const here = evidence(probabilities[t]);
    const from = [0, 1].map((s) => (score[s] + stay >= score[1 - s] + move ? s : 1 - s));
    score = [0, 1].map((s) => score[from[s]] + (from[s] === s ? stay : move) + here[s]);
    cameFrom.push(from);
  }
  const sung = new Array<boolean>(probabilities.length).fill(false);
  let state = score[1] > score[0] ? 1 : 0;
  for (let t = probabilities.length - 1; t >= 0; t--) {
    sung[t] = state === 1;
    if (t > 0) state = cameFrom[t - 1][state];
  }
  return sung;
}

/** The sung stretches of a take, each from its first sung voice to its last; a long silence splits one. */
export function sungStretches(
  frames: PitchFrame[],
  sound: SoundFrame[],
  speech: SpeechTurn[],
  model: SingingModel = SINGING_MODEL,
): { start: number; end: number }[] {
  const sung = decodeSinging(singingProbabilities(singingFeatures(frames, sound, speech), model), model);
  const stretches: { start: number; end: number }[] = [];
  let open: { start: number; end: number } | null = null;
  frames.forEach((frame, i) => {
    if (!sung[i]) {
      open = null;
      return;
    }
    if (frame.frequency === null) return;
    if (open && frame.time - open.end > SPAN_GAP_SECONDS) open = null;
    if (!open) stretches.push((open = { start: frame.time, end: frame.time + FRAME_SECONDS }));
    else open.end = frame.time + FRAME_SECONDS;
  });
  return stretches;
}
