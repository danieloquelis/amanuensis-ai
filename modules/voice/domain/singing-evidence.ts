import type { PitchFrame } from "./pitch-tracker";
import type { SoundFrame } from "./spectrum";
import { vocableMask, wordOf } from "./sung-syllables";
import type { SpeechTurn } from "./take";

const FRAME_SECONDS = 0.01;
/** Recognizer timestamps are loose at the edges of words. */
const SPEECH_MARGIN_SECONDS = 0.15;
/**
 * How fast people talk: letters per second of voice, measured 11–44 over 36 spoken turns (voice
 * as the learned pitch tracker hears it), 24 typically. The recognizer's turns are loose, often
 * stretched over the singing that follows, so its words are placed over the voice at each of
 * these speeds, and the model learns how far to trust each.
 */
const SPEAKING_RATES = [12, 24, 44];
/** A pitch step this big (cents) or more from one frame to the next counts as a full slide. */
const SLIDE_CENTS = 100;
/** Each frame's evidence is averaged over the voice this many frames either side (a quarter second). */
const HALF_WINDOW_FRAMES = 25;

/**
 * What each frame's evidence holds, in order: how its sound changes and pulses (see
 * `SoundFrame`), how far its pitch slides from the frame before, how sure the pitch tracker is
 * of it, whether the recognizer's words reach it at a slow, typical and fast talking speed,
 * whether it is one of the syllables the recognizer wrote down for singing, and how much of
 * the time around it there is voice at all.
 */
export const FEATURES = [
  "flux",
  "harmonicity",
  "syllableRhythm",
  "pitchSlide",
  "clarity",
  "unwordedSlow",
  "vocable",
  "unwordedTypical",
  "unwordedFast",
  "voiced",
] as const;

/**
 * Which voiced frames the recognizer's words account for, if spoken at `lettersPerSecond`, and
 * which of them are syllables it wrote down for singing. Each turn's words are spread over its
 * first voiced frames by letters.
 */
export function wordsInFrames(frames: PitchFrame[], speech: SpeechTurn[], lettersPerSecond = SPEAKING_RATES[0]) {
  const worded = new Array<boolean>(frames.length).fill(false);
  const vocable = new Array<boolean>(frames.length).fill(false);
  for (const turn of speech) {
    const words = turn.text.split(/\s+/).map(wordOf).filter(Boolean);
    const sung = vocableMask(words);
    const letters = words.reduce((sum, word) => sum + word.length, 0);
    const inside = frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => frame.frequency !== null)
      .filter(({ frame }) => frame.time >= turn.start - SPEECH_MARGIN_SECONDS)
      .filter(({ frame }) => frame.time <= turn.end + SPEECH_MARGIN_SECONDS)
      .map(({ index }) => index);
    const room = Math.min(inside.length, Math.ceil(letters / lettersPerSecond / FRAME_SECONDS));
    let cursor = 0;
    words.forEach((word, k) => {
      const count = Math.round((word.length / letters) * room);
      for (const index of inside.slice(cursor, cursor + count)) {
        worded[index] = true;
        vocable[index] = sung[k];
      }
      cursor += count;
    });
    for (const index of inside.slice(cursor, room)) worded[index] = true;
  }
  return { worded, vocable };
}

/** Each voiced frame's evidence (in `FEATURES` order), averaged over the voice around it; null without voice. */
export function singingFeatures(frames: PitchFrame[], sound: SoundFrame[], speech: SpeechTurn[]): (number[] | null)[] {
  const [slow, typical, fast] = SPEAKING_RATES.map((rate) => wordsInFrames(frames, speech, rate));
  const cents = (frame: PitchFrame) => 1200 * Math.log2(frame.frequency! / 440);
  const own = frames.map((frame, i) => {
    if (frame.frequency === null) return null;
    const before = frames[i - 1];
    const slide = before?.frequency ? Math.abs(cents(frame) - cents(before)) : SLIDE_CENTS;
    return [
      sound[i].flux,
      sound[i].harmonicity,
      sound[i].syllableRhythm,
      Math.min(SLIDE_CENTS, slide) / SLIDE_CENTS,
      frame.clarity,
      Number(!slow.worded[i]),
      Number(slow.vocable[i]),
      Number(!typical.worded[i]),
      Number(!fast.worded[i]),
    ];
  });
  const voiced = frames.map((_, i) => i).filter((i) => own[i] !== null);
  let from = 0;
  return own.map((values, i) => {
    if (!values) return null;
    while (voiced[from] < i - HALF_WINDOW_FRAMES) from++;
    const near: number[][] = [];
    for (let k = from; k < voiced.length && voiced[k] <= i + HALF_WINDOW_FRAMES; k++) near.push(own[voiced[k]]!);
    const mean = values.map((_, f) => near.reduce((sum, row) => sum + row[f], 0) / near.length);
    return [...mean, near.length / (2 * HALF_WINDOW_FRAMES + 1)];
  });
}
