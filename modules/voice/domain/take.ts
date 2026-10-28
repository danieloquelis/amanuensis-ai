import { trackPitch, type PitchFrame, type Signal } from "./pitch-tracker";

/** Words the speech recognizer heard, with their time in the take (seconds). */
export type SpeechTurn = { start: number; end: number; text: string };
/** A stretch of singing, addressed by the agent's tools as `id`. */
export type SungSpan = { id: string; start: number; end: number };
export type VoiceTake = { signal: Signal; speech: SpeechTurn[]; sung: SungSpan[] };

/**
 * Singing holds pitch most of the time; speech is voiced in short bursts. Measured on a real
 * take (2 s windows): speech 7–44 % voiced, singing 53–68 %.
 */
const SINGING_VOICED_SHARE = 0.5;
const WINDOW_SECONDS = 1;
const HOP_SECONDS = 0.5;
/** Recognizer timestamps are loose at the edges of words. */
const SPEECH_MARGIN_SECONDS = 0.15;
const MIN_SPAN_SECONDS = 1;
/** How far back a span may reach into a speech turn, and how sung that stretch must be. */
const MAX_REACH_SECONDS = 2;
const REACH_STEP_SECONDS = 0.1;
const REACH_WINDOW_SECONDS = 0.5;
const REACH_VOICED_SHARE = 0.6;
/** Singing windows closer than this belong to one span (a breath, a held rest). */
const JOIN_GAP_SECONDS = 1.5;

/**
 * Finds the sung stretches of a take: windows that hold pitch like singing does, outside the
 * recognizer's speech turns. Works without speech turns too, from voicing alone.
 */
export function findSungSpans(frames: PitchFrame[], speech: SpeechTurn[]): SungSpan[] {
  const isSpeech = (time: number) =>
    speech.some((turn) => time >= turn.start - SPEECH_MARGIN_SECONDS && time <= turn.end + SPEECH_MARGIN_SECONDS);
  const usable = frames.filter((f) => !isSpeech(f.time));
  const duration = frames.length ? frames.at(-1)!.time : 0;
  const spans: { start: number; end: number }[] = [];
  for (let from = 0; from + WINDOW_SECONDS <= duration + HOP_SECONDS; from += HOP_SECONDS) {
    const window = usable.filter((f) => f.time >= from && f.time < from + WINDOW_SECONDS);
    const voiced = window.filter((f) => f.frequency !== null);
    if (window.length < (WINDOW_SECONDS / 0.01) * 0.8) continue;
    if (voiced.length / window.length < SINGING_VOICED_SHARE) continue;
    const start = voiced[0].time;
    const end = voiced.at(-1)!.time + 0.01;
    const last = spans.at(-1);
    const spokeBetween = last && speech.some((t) => t.start >= last.end && t.start <= start);
    if (last && !spokeBetween && start - last.end <= JOIN_GAP_SECONDS) last.end = Math.max(last.end, end);
    else spans.push({ start, end });
  }
  return spans
    .filter((s) => s.end - s.start >= MIN_SPAN_SECONDS)
    .map((s) => ({ ...s, start: reachBack(s.start, frames) }))
    .map((s, i) => ({ id: `sung-${i + 1}`, start: round(s.start), end: round(s.end) }));
}

/**
 * The recognizer often counts the first notes after talking as speech. Singing that started
 * earlier, inside the end of a speech turn, is recovered: the span reaches back while the voice
 * keeps holding pitch the way singing does, up to a couple of seconds.
 */
function reachBack(start: number, frames: PitchFrame[]): number {
  let earliest = start;
  for (let t = start - REACH_STEP_SECONDS; t >= start - MAX_REACH_SECONDS; t -= REACH_STEP_SECONDS) {
    const window = frames.filter((f) => f.time >= t - REACH_WINDOW_SECONDS && f.time < t);
    const voiced = window.filter((f) => f.frequency !== null).length;
    if (!window.length || voiced / window.length < REACH_VOICED_SHARE) break;
    earliest = t - REACH_WINDOW_SECONDS;
  }
  return frames.find((f) => f.time >= earliest && f.frequency !== null)?.time ?? start;
}

const round = (seconds: number) => Math.round(seconds * 100) / 100;

export function createTake(signal: Signal, speech: SpeechTurn[]): VoiceTake {
  return { signal, speech, sung: findSungSpans(trackPitch(signal), speech) };
}

/** The audio of one sung span, or null if the take has no such span. */
export function spanSignal(take: VoiceTake, spanId: string): Signal | null {
  const span = take.sung.find((s) => s.id === spanId);
  if (!span) return null;
  const rate = take.signal.sampleRate;
  return {
    ...take.signal,
    samples: take.signal.samples.slice(Math.floor(span.start * rate), Math.ceil(span.end * rate)),
  };
}

/**
 * The take as the agent reads it: what was said and where singing happened, in time order.
 * `"…"` marks words; sung spans carry the ID the voice tools take.
 */
export function describeTake(take: VoiceTake): string {
  const said = take.speech.map((t) => ({ at: t.start, line: `${time(t)} said: "${t.text}"` }));
  const sang = take.sung.map((s) => ({ at: s.start, line: `${time(s)} sang: ${s.id} (${round(s.end - s.start)} s)` }));
  const lines = [...said, ...sang].sort((a, b) => a.at - b.at).map((e) => e.line);
  const length = round(take.signal.samples.length / take.signal.sampleRate);
  return [`[Voice take, ${length} s]`, ...(lines.length ? lines : ["(nothing heard)"])].join("\n");
}

const time = (span: { start: number; end: number }) => `${span.start.toFixed(1)}–${span.end.toFixed(1)} s`;
