import type { PitchFrame } from "./pitch-tracker";

/** A sung note: timing in seconds, pitch as fractional MIDI before rounding. */
export type SungNote = { start: number; end: number; midi: number; cents: number; clarity: number };
/** `reattacked` marks a segment that began at a loudness dip (a re-sung pitch). */
export type Segment = { frames: PitchFrame[]; midis: number[]; reattacked?: boolean };

/** Frames within this many semitones of a note's centre belong to it. */
export const SAME_NOTE_SEMITONES = 0.7;
/** A piece this short that runs straight into the next note is the singer sliding into it. */
const SCOOP_SECONDS = 0.1;
/** A piece at most this long, between two notes and pitched between them, is a slide. */
const SLIDE_SECONDS = 0.12;
/** The voice may break briefly between the slide and the note it reaches. */
const SLIDE_GAP_SECONDS = 0.08;
/**
 * A re-sung pitch ("la-la") dips to below this share of the loudness around it, then recovers.
 * Vibrato also pulses the loudness, but never this deeply.
 */
const REARTICULATION_DIP = 0.25;
const DIP_CONTEXT_FRAMES = 8;

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const duration = (segment: Segment) =>
  segment.frames[segment.frames.length - 1].time - segment.frames[0].time + 0.01;

/** Splits a held pitch where the loudness dips and recovers ("la-la" on one note). */
export function splitAtRearticulations(segment: Segment): Segment[] {
  const loudness = segment.frames.map((f) => f.rms);
  const around = (from: number, to: number) => Math.max(...loudness.slice(Math.max(0, from), Math.max(0, to)));
  const parts: Segment[] = [];
  let start = 0;
  for (let i = 2; i < segment.frames.length - 2; i++) {
    const before = around(i - DIP_CONTEXT_FRAMES, i);
    const after = around(i + 1, i + 1 + DIP_CONTEXT_FRAMES);
    const isLocalMinimum = loudness[i] <= loudness[i - 1] && loudness[i] <= loudness[i + 1];
    const deep = loudness[i] < Math.min(before, after) * REARTICULATION_DIP;
    if (isLocalMinimum && deep && i - start > 5) {
      parts.push({
        frames: segment.frames.slice(start, i),
        midis: segment.midis.slice(start, i),
        reattacked: start > 0,
      });
      start = i;
    }
  }
  parts.push({ frames: segment.frames.slice(start), midis: segment.midis.slice(start), reattacked: start > 0 });
  return parts;
}

/**
 * Joins neighbouring pieces of one held pitch that were split without a gap or a re-attack,
 * and a scoop (a short slide straight into the next pitch) into the note it leads to.
 */
export function mergeContinuations(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    const touching = previous && segment.frames[0].time - previous.frames.at(-1)!.time <= 0.015;
    const samePitch = previous && Math.abs(toNote(previous).midi - toNote(segment).midi) <= SAME_NOTE_SEMITONES;
    const scoop = previous && duration(previous) < SCOOP_SECONDS;
    if (previous && touching && (samePitch || scoop) && !segment.reattacked) append(previous, segment);
    else merged.push({ ...segment, frames: [...segment.frames], midis: [...segment.midis] });
  }
  return merged;
}

/**
 * A short piece between two notes (joined to the first, at most a brief break before the second),
 * pitched between them, is the voice sliding from one
 * note to the next (C♯ → E passing through D); it is the end of the earlier note.
 */
export function absorbSlides(segments: Segment[]): Segment[] {
  const kept: Segment[] = [];
  segments.forEach((segment, i) => {
    const previous = kept.at(-1);
    const next = segments[i + 1];
    const gap = (a: Segment, b: Segment) => b.frames[0].time - a.frames.at(-1)!.time;
    const between = previous && next && gap(previous, segment) <= 0.015 && gap(segment, next) <= SLIDE_GAP_SECONDS;
    if (between && duration(segment) <= SLIDE_SECONDS) {
      const [low, high] = [toNote(previous).midi, toNote(next).midi].sort((a, b) => a - b);
      const pitch = toNote(segment).midi;
      if (pitch > low && pitch < high) return append(previous, segment);
    }
    kept.push(segment);
  });
  return kept;
}

export function append(target: Segment, extra: Segment) {
  target.frames.push(...extra.frames);
  target.midis.push(...extra.midis);
}

/** The pitch of a note is the median of its steady middle, ignoring the attack and release. */
export function toNote(segment: Segment): SungNote {
  const from = Math.floor(segment.midis.length * 0.2);
  const to = Math.max(from + 1, Math.ceil(segment.midis.length * 0.8));
  const midi = median(segment.midis.slice(from, to));
  return {
    start: segment.frames[0].time,
    end: segment.frames[segment.frames.length - 1].time + 0.01,
    midi,
    cents: Math.round((midi - Math.round(midi)) * 100),
    clarity: median(segment.frames.map((f) => f.clarity)),
  };
}
