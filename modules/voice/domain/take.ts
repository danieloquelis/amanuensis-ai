import { trackPitch, type PitchFrame, type Signal } from "./pitch-tracker";
import { sungStretches } from "./singing-decoder";
import { soundFrames, type SoundFrame } from "./spectrum";
import { speechAroundSinging } from "./sung-syllables";

/** Words the speech recognizer heard, with their time in the take (seconds). */
export type SpeechTurn = { start: number; end: number; text: string };
/** A stretch of singing, or of other voice, addressed by the agent's tools as `id`. */
export type SungSpan = { id: string; start: number; end: number };
/**
 * `sung` is what was heard as singing; `voice` is every other stretch of voice, which the agent
 * may still pass to the voice tools when the musician's words say they sang there.
 */
export type VoiceTake = {
  signal: Signal;
  speech: SpeechTurn[];
  sung: SungSpan[];
  voice: SungSpan[];
};

/** Voiced frames closer than this (seconds) are one stretch of voice. */
const VOICE_GAP_SECONDS = 0.35;
/** Shorter than this (seconds) is a click or a breath, not voice worth offering. */
const MIN_VOICE_SECONDS = 0.3;
const FRAME_SECONDS = 0.01;

const round = (seconds: number) => Math.round(seconds * 100) / 100;
const numbered = (prefix: string, stretches: { start: number; end: number }[]): SungSpan[] =>
  stretches.map((s, i) => ({ id: `${prefix}-${i + 1}`, start: round(s.start), end: round(s.end) }));

/** The sung stretches of a take (see `sungStretches`), numbered for the agent's tools. */
export function findSungSpans(frames: PitchFrame[], sound: SoundFrame[], speech: SpeechTurn[]): SungSpan[] {
  return numbered("sung", sungStretches(frames, sound, speech));
}

/** Stretches of voice outside the sung spans. */
function otherVoice(frames: PitchFrame[], sung: SungSpan[]): SungSpan[] {
  const stretches: { start: number; end: number }[] = [];
  for (const frame of frames) {
    if (frame.frequency === null || sung.some((s) => frame.time >= s.start && frame.time <= s.end)) continue;
    const last = stretches.at(-1);
    if (last && frame.time - last.end <= VOICE_GAP_SECONDS) last.end = frame.time + FRAME_SECONDS;
    else stretches.push({ start: frame.time, end: frame.time + FRAME_SECONDS });
  }
  return numbered(
    "voice",
    stretches.filter((s) => s.end - s.start >= MIN_VOICE_SECONDS),
  );
}

/**
 * A take as the agent hears it: where the musician sang, what they said around it (without the
 * syllables the recognizer wrote down for the singing), and the rest of their voice.
 */
export function createTake(signal: Signal, speech: SpeechTurn[]): VoiceTake {
  const frames = trackPitch(signal);
  const sung = findSungSpans(frames, soundFrames(signal, frames), speech);
  return {
    signal,
    speech: speechAroundSinging(speech, sung),
    sung,
    voice: otherVoice(frames, sung),
  };
}

const spanOf = (take: VoiceTake, spanId: string) => [...take.sung, ...take.voice].find((s) => s.id === spanId);

/** The audio of one sung span (or other stretch of voice), or null if the take has no such span. */
export function spanSignal(take: VoiceTake, spanId: string): Signal | null {
  const span = spanOf(take, spanId);
  if (!span) return null;
  const rate = take.signal.sampleRate;
  return {
    ...take.signal,
    samples: take.signal.samples.slice(Math.floor(span.start * rate), Math.ceil(span.end * rate)),
  };
}

/** YIN pitch frames of one span. */
export function spanFrames(take: VoiceTake, spanId: string): PitchFrame[] | null {
  const signal = spanSignal(take, spanId);
  if (!signal) return null;
  return trackPitch(signal);
}
