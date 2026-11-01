import type { SungNote } from "./note-pieces";
import type { PitchFrame } from "./pitch-tracker";

/** Loudness must at least double, against the quietest point just before, to be an attack. */
const RISE = 2;
/** How far back (frames) the quiet point before an attack is looked for. */
const LOOK_BACK_FRAMES = 6;
/** An attack this soft beside the take's notes (share of their typical loudness) is noise. */
const MIN_SHARE = 0.06;
/** An attack this close (seconds) to a heard note's start is that note's own attack. */
const NOTE_START_MARGIN = 0.08;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * Where something was clearly struck or sung but no note was heard: a pluck or a syllable whose
 * pitch the tracker could not read (a muted string, a breathy "ta"). They are what the ear may have
 * missed, by time in the take, for the agent to weigh: often a repeat of the note around it.
 * An attack is a sudden rise in loudness, outside a heard note and away from where one starts.
 */
export function missedAttacks(frames: PitchFrame[], notes: SungNote[]): number[] {
  const typical = median(notes.map((note) => peakIn(frames, note.start, note.end)));
  if (!typical) return [];
  const found: number[] = [];
  for (let i = LOOK_BACK_FRAMES; i < frames.length - 1; i++) {
    const { time, rms } = frames[i];
    const quietest = Math.min(...frames.slice(i - LOOK_BACK_FRAMES, i).map((f) => f.rms));
    const rising = rms >= RISE * quietest && rms >= MIN_SHARE * typical;
    const peak = rms >= frames[i - 1].rms && rms >= frames[i + 1].rms;
    if (!rising || !peak) continue;
    const inNote = notes.some((note) => time >= note.start - NOTE_START_MARGIN && time <= note.end);
    const afterLast = found.length && time - found[found.length - 1] < NOTE_START_MARGIN;
    if (!inNote && !afterLast) found.push(time);
  }
  return found;
}

function peakIn(frames: PitchFrame[], start: number, end: number): number {
  let peak = 0;
  for (const frame of frames) if (frame.time >= start && frame.time <= end) peak = Math.max(peak, frame.rms);
  return peak;
}
