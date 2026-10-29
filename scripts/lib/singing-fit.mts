// Hearing takes the way the app does, and fitting the singing model's evidence weights to them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeSinging,
  decodeWav,
  encodeWav,
  singingFeatures,
  singingProbabilities,
  soundFrames,
  trackPitch,
  withPitchTrack,
  wordsInFrames,
  type PitchFrame,
  type Signal,
  type SingingModel,
  type SoundFrame,
  type SpeechTurn,
} from "@/modules/voice";
import { cachedRecognizer, createMuseTranscriber, createSwiftF0Tracker } from "@/modules/voice/server";
import { emptyScore, scoreMix, type BoundaryScore } from "./boundary-score.mjs";
import type { Mix } from "./singing-mixes.mjs";
import { readRawSpeech } from "./takes.mjs";

const STEPS = 400;
const LEARNING_RATE = 0.5;
const L2 = 0.001;
/** Every third frame is plenty: neighbours share most of their evidence. */
const SAMPLE_EVERY = 3;

const tracker = createSwiftF0Tracker();
const recognizer = cachedRecognizer(createMuseTranscriber(process.env.META_AI_API_KEY ?? ""), ".cache/transcripts");

export type Heard = { frames: PitchFrame[]; sound: SoundFrame[]; speech: SpeechTurn[]; features: (number[] | null)[] };
/** Frames with what each is known to be: 1 sung, 0 talk, null unknown or no voice. */
export type Labeled = { features: (number[] | null)[]; truth: (number | null)[] };
export type HeardMix = Heard & Labeled & { mix: Mix };

/** Pitch, sound and words as the app gets them; words from the speech service unless given. */
export async function hear(signal: Signal, speech?: SpeechTurn[]): Promise<Heard> {
  const frames = withPitchTrack(trackPitch(signal), await tracker.track(signal));
  const sound = soundFrames(signal, frames);
  const words = speech ?? (await recognizer.transcribe(encodeWav(signal)));
  return { frames, sound, speech: words, features: singingFeatures(frames, sound, words) };
}

export async function hearTake(prefix: string): Promise<Heard> {
  const folder = join(
    ".takes",
    readdirSync(".takes").find((name) => name.startsWith(prefix))!,
  );
  return hear(decodeWav(new Uint8Array(readFileSync(join(folder, "take.wav")))), readRawSpeech(folder));
}

export async function hearMix(mix: Mix): Promise<HeardMix> {
  const heard = await hear(mix.signal);
  const truth = heard.frames.map((frame, i) => {
    const part = mix.truth.find((t) => frame.time >= t.start && frame.time < t.end);
    return part && heard.features[i] ? Number(part.kind === "sung") : null;
  });
  return { ...heard, truth, mix };
}

/** Letters per second of voice faster than anyone talks: the words surely take at least this much voice. */
const FASTEST_TALK = 44;

/**
 * A real take of talk then singing, labeled only where the recognizer's words surely are: the
 * syllables it wrote for singing ("…add ta ta ta") were sung, and the voice its other words need
 * even at the fastest talking speed was said. Voice a slower talker might still be using is left
 * unlabeled: the recognizer often stretches a turn over the singing after it.
 */
export function labeledByWords(heard: Heard): Labeled {
  const slow = wordsInFrames(heard.frames, heard.speech);
  const fast = wordsInFrames(heard.frames, heard.speech, FASTEST_TALK);
  return {
    features: heard.features,
    truth: heard.features.map((x, i) => {
      if (!x) return null;
      if (slow.vocable[i]) return 1;
      return fast.worded[i] && !fast.vocable[i] ? 0 : null;
    }),
  };
}

/** Logistic regression on standardized features, by gradient descent with a little L2. */
export function fitEvidence(sets: Labeled[]): Omit<SingingModel, "evidenceWeight" | "switchChance"> {
  const rows = sets.flatMap((m) =>
    m.features.flatMap((x, i) => (x && m.truth[i] !== null && i % SAMPLE_EVERY === 0 ? [{ x, y: m.truth[i]! }] : [])),
  );
  const n = rows[0].x.length;
  const mean = Array.from({ length: n }, (_, f) => rows.reduce((s, r) => s + r.x[f], 0) / rows.length);
  const spread = mean.map((m, f) => Math.sqrt(rows.reduce((s, r) => s + (r.x[f] - m) ** 2, 0) / rows.length) || 1);
  const z = rows.map((r) => r.x.map((v, f) => (v - mean[f]) / spread[f]));
  let weights = new Array<number>(n).fill(0);
  let bias = 0;
  for (let step = 0; step < STEPS; step++) {
    const gradient = new Array<number>(n).fill(0);
    let biasGradient = 0;
    rows.forEach((row, k) => {
      const p = 1 / (1 + Math.exp(-(bias + z[k].reduce((s, v, f) => s + v * weights[f], 0))));
      z[k].forEach((v, f) => (gradient[f] += (p - row.y) * v));
      biasGradient += p - row.y;
    });
    weights = weights.map((w, f) => w - LEARNING_RATE * (gradient[f] / rows.length + L2 * w));
    bias -= (LEARNING_RATE * biasGradient) / rows.length;
  }
  const round = (x: number) => Math.round(x * 1e4) / 1e4;
  return {
    mean: mean.map(round),
    spread: spread.map(round),
    weights: weights.map(round),
    bias: round(bias),
    prior: round(rows.filter((r) => r.y).length / rows.length),
  };
}

/** How a model reads a set of mixes against their truth. */
export function scoreMixes(mixes: HeardMix[], model: SingingModel): BoundaryScore {
  const total = emptyScore();
  for (const m of mixes) {
    const sung = decodeSinging(singingProbabilities(m.features, model), model);
    scoreMix(
      m.mix,
      m.frames,
      sung.map((s, i) => (m.features[i] ? s : null)),
      total,
    );
  }
  return total;
}
