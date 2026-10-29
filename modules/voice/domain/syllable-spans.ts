import type { PitchFrame } from "./pitch-tracker";
import { closingSyllables } from "./sung-syllables";
import type { SpeechTurn, SungSpan } from "./take";

/** Voiced frames further apart than this (seconds) belong to different syllables or words. */
const BURST_GAP_SECONDS = 0.03;
const FRAME_SECONDS = 0.01;
/** Less than this (seconds) is a stray syllable, not a sung figure. */
const MIN_SYLLABLES_SECONDS = 0.5;
/** Sung stretches closer than this (seconds) are one span. */
const TOUCHING_SECONDS = 0.3;
/** Faster than this nobody sings syllables: the words belong to singing elsewhere in the take. */
const MAX_SYLLABLES_PER_SECOND = 8;
/** Singing this soon (seconds) after a turn, with nothing said between, is what its syllables were written down for. */
const EXPLAINED_WITHIN_SECONDS = 3;

type Stretch = { start: number; end: number };

/**
 * Detached sung syllables ("da · da · da") are voiced in short bursts, just as talk is, so pitch
 * alone cannot tell them apart; the recognizer writes them down as words, inside a speech turn
 * or as one of their own. A turn whose text ends in such a run was sung from where the run
 * starts: that stretch is returned as singing, and the turn ends before it (a turn of nothing
 * but syllables keeps no time at all). Not when singing the voicing already `found` follows the
 * turn (the syllables are that singing, written down too early), nor when the run could not have
 * been sung in the time there is. Turns stay one-to-one with the input.
 */
export function splitSungSyllables(
  speech: SpeechTurn[],
  frames: PitchFrame[],
  found: Stretch[],
): { turns: SpeechTurn[]; sung: Stretch[] } {
  const sung: Stretch[] = [];
  const turns = speech.map((turn) => {
    const run = closingSyllables(turn.text);
    const voiced = frames.filter((f) => f.time >= turn.start && f.time <= turn.end && f.frequency !== null);
    const explained = found.some(
      (s) =>
        s.end > turn.start &&
        s.start <= turn.end + EXPLAINED_WITHIN_SECONDS &&
        !speech.some((other) => other.start > turn.end && other.start < s.start),
    );
    if (!run || !voiced.length || explained) return turn;
    const start = runStart(voiced, run.share);
    const end = voiced.at(-1)!.time + FRAME_SECONDS;
    const seconds = end - start;
    if (seconds < MIN_SYLLABLES_SECONDS || run.count / seconds > MAX_SYLLABLES_PER_SECOND) return turn;
    sung.push({ start, end });
    return { ...turn, end: Math.max(turn.start, Math.min(turn.end, start)) };
  });
  return { turns, sung };
}

/**
 * Where the closing run begins: the voiced time is shared out between the words and the
 * syllables by their letters, and the estimate moves to the nearest onset of a burst, since a
 * syllable starts where its voice does.
 */
function runStart(voiced: PitchFrame[], share: number): number {
  if (share >= 1) return voiced[0].time;
  const estimate = Math.min(voiced.length - 1, Math.round(voiced.length * (1 - share)));
  const onsets = voiced
    .filter((frame, i) => i === 0 || frame.time - voiced[i - 1].time > BURST_GAP_SECONDS)
    .map((frame) => frame.time);
  const target = voiced[estimate].time;
  return onsets.reduce((best, onset) => (Math.abs(onset - target) < Math.abs(best - target) ? onset : best));
}

/** Sung stretches found either way, in order, overlapping or touching ones as one, numbered. */
export function numberSpans(stretches: Stretch[]): SungSpan[] {
  const merged: Stretch[] = [];
  for (const stretch of [...stretches].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && stretch.start <= last.end + TOUCHING_SECONDS) last.end = Math.max(last.end, stretch.end);
    else merged.push({ ...stretch });
  }
  return merged.map((s, i) => ({ id: `sung-${i + 1}`, start: round(s.start), end: round(s.end) }));
}

const round = (seconds: number) => Math.round(seconds * 100) / 100;
