import { segmentNotes } from "./notes";
import { trackPitch, withPitchTrack, type PitchFrame, type PitchTrack, type Signal } from "./pitch-tracker";

/** Words the speech recognizer heard, with their time in the take (seconds). */
export type SpeechTurn = { start: number; end: number; text: string };
/** A stretch of singing, addressed by the agent's tools as `id`. */
export type SungSpan = { id: string; start: number; end: number };
/** `track` is a learned tracker's pitch over the whole take, when one ran (YIN is used otherwise). */
export type VoiceTake = { signal: Signal; speech: SpeechTurn[]; sung: SungSpan[]; track?: PitchTrack };

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
/** A pause inside a speech turn: unvoiced and this quiet (normalized RMS) for this long. */
const PAUSE_RMS = 0.03;
const PAUSE_SECONDS = 0.25;
const FRAME_SECONDS = 0.01;
/** Words before the pause: at least this much voice, so a quiet start of the turn is not one. */
const WORDS_SECONDS = 0.3;
/**
 * Singing holds steady pitches; speech slides. Measured on six takes: speech spends 9–44 % of
 * its time in notes held at least 0.15 s, singing 47–77 %.
 */
const HELD_NOTE_SECONDS = 0.15;
const SINGING_HELD_SHARE = 0.5;

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

/** Sung spans are found from YIN's voicing, which their thresholds were measured with. */
export function createTake(signal: Signal, speech: SpeechTurn[], track?: PitchTrack): VoiceTake {
  const frames = trackPitch(signal);
  const turns = endTurnsBeforeSinging(speech, frames);
  return { signal, speech: turns, sung: findSungSpans(frames, turns), ...(track ? { track } : {}) };
}

/**
 * "…a rhythm like" — pause — sung notes: the recognizer often stretches the speech turn over
 * the singing that follows. A turn whose words end in a pause followed by a stretch held like
 * singing (at least a second, mostly voiced, mostly steady notes) ends at that pause, leaving
 * the singing to be found.
 */
export function endTurnsBeforeSinging(speech: SpeechTurn[], frames: PitchFrame[]): SpeechTurn[] {
  return speech.map((turn) => {
    const end = sungUntil(frames, turn.end);
    const pauses = pausesAfterWords(frames.filter((f) => f.time >= turn.start && f.time <= turn.end));
    // Walk back from the end: breaths between sung phrases are pauses too, so the cut moves to
    // an earlier pause while the stretch after it still sounds sung, and stops where talk begins.
    let cut: { start: number; end: number } | null = null;
    for (let i = pauses.length - 1; i >= 0; i--) {
      const until = i + 1 < pauses.length ? pauses[i + 1].start : end;
      if (!holdsNotes(frames.filter((f) => f.time >= pauses[i].end && f.time < until))) break;
      cut = pauses[i];
    }
    if (!cut) return turn;
    const after = frames.filter((f) => f.time >= cut.end && f.time <= end);
    return soundsSung(after) ? { ...turn, end: round(cut.start) } : turn;
  });
}

/** Pauses inside a turn that come after some words, in order. */
function pausesAfterWords(inTurn: PitchFrame[]): { start: number; end: number }[] {
  const quiet = (f: PitchFrame) => f.frequency === null && f.rms < PAUSE_RMS;
  const pauses: { start: number; end: number }[] = [];
  let pauseStart = -1;
  let voicedBefore = 0;
  inTurn.forEach((frame, i) => {
    if (quiet(frame) && pauseStart === -1) pauseStart = i;
    if (!quiet(frame) && pauseStart !== -1) {
      const long = (i - pauseStart) * FRAME_SECONDS >= PAUSE_SECONDS;
      if (long && voicedBefore * FRAME_SECONDS >= WORDS_SECONDS) {
        pauses.push({ start: inTurn[pauseStart].time, end: frame.time });
      }
      pauseStart = -1;
    }
    if (frame.frequency !== null) voicedBefore++;
  });
  return pauses;
}

/** At least a second, mostly voiced, and mostly in held notes: singing rather than talk. */
function soundsSung(stretch: PitchFrame[]): boolean {
  return stretch.length * FRAME_SECONDS >= MIN_SPAN_SECONDS && holdsNotes(stretch);
}

/** Mostly voiced and mostly in held notes, however short: a sung phrase, not words. */
function holdsNotes(stretch: PitchFrame[]): boolean {
  if (!stretch.length) return false;
  const seconds = stretch.length * FRAME_SECONDS;
  const voiced = stretch.filter((f) => f.frequency !== null).length / stretch.length;
  const held = segmentNotes(stretch)
    .filter((note) => note.end - note.start >= HELD_NOTE_SECONDS)
    .reduce((sum, note) => sum + note.end - note.start, 0);
  return voiced >= REACH_VOICED_SHARE && held / seconds >= SINGING_HELD_SHARE;
}

/** Where the voice falls silent after `from`: the end of the stretch that continues past it. */
function sungUntil(frames: PitchFrame[], from: number): number {
  const silence = frames.find((f, i) => {
    if (f.time < from) return false;
    const next = frames.slice(i, i + PAUSE_SECONDS / FRAME_SECONDS);
    return next.length > 0 && next.every((g) => g.frequency === null && g.rms < PAUSE_RMS);
  });
  return silence?.time ?? frames.at(-1)?.time ?? from;
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

/** Pitch frames of one sung span: the learned tracker's pitch when the take has it, else YIN's. */
export function spanFrames(take: VoiceTake, spanId: string): PitchFrame[] | null {
  const signal = spanSignal(take, spanId);
  if (!signal) return null;
  const start = take.sung.find((s) => s.id === spanId)!.start;
  return take.track ? withPitchTrack(trackPitch(signal), take.track, start) : trackPitch(signal);
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
