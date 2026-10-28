import {
  absorbSlides,
  append,
  duration,
  median,
  mergeContinuations,
  SAME_NOTE_SEMITONES,
  splitAtRearticulations,
  toNote,
  type Segment,
  type SungNote,
} from "./note-pieces";
import type { PitchFrame } from "./pitch-tracker";
import { foldPitchDips } from "./pitch-excursions";

export type { SungNote } from "./note-pieces";

/**
 * A new note needs the pitch to stay away from the current one, on one side, for this many
 * frames (60 ms). Vibrato peaks and scoops return sooner, so they never split a note.
 */
const STEP_FRAMES = 6;
const ATTACK_FRAMES = 3;
/** Frames this far (semitones) from their neighbours are octave errors, folded back. */
const OCTAVE_JUMP = 10;
const NEIGHBOURHOOD = 5;
const MIN_NOTE_SECONDS = 0.07;
/** Unvoiced frames tolerated inside a note (a consonant or a crack). */
const MAX_INNER_GAP_FRAMES = 3;

export const frequencyToMidi = (frequency: number) => 69 + 12 * Math.log2(frequency / 440);

/**
 * Groups pitched frames into notes. Vibrato stays one note; a pitch change, a silence, or a
 * loudness dip (re-sung same pitch) starts a new one; glides too short to be notes are dropped.
 * Pitches are as sung: the singer's tuning is removed later, against the key (`tuneToScale`).
 */
export function segmentNotes(frames: PitchFrame[]): SungNote[] {
  const segments: Segment[] = [];
  let current: Segment | null = null;
  // Frames that strayed from the current note; they start a new note only if the step persists.
  let pending: Segment = { frames: [], midis: [] };
  let gap = 0;
  const close = () => {
    if (current) segments.push(current);
    current = null;
  };
  const midis = foldPitchDips(foldOctaveErrors(frames));
  frames.forEach((frame, index) => {
    const midi = midis[index];
    if (midi === null) {
      gap++;
      if (gap > MAX_INNER_GAP_FRAMES) {
        if (current) append(current, pending);
        pending = { frames: [], midis: [] };
        close();
      }
      return;
    }
    gap = 0;
    if (!current) {
      current = { frames: [frame], midis: [midi] };
      return;
    }
    const centre = noteCentre(current);
    if (Math.abs(midi - centre) <= SAME_NOTE_SEMITONES) {
      // An excursion that came back (vibrato, scoop): it belonged to this note after all.
      append(current, pending);
      pending = { frames: [], midis: [] };
      current.frames.push(frame);
      current.midis.push(midi);
      return;
    }
    const sameSide = pending.midis.every((m) => Math.sign(m - centre) === Math.sign(midi - centre));
    if (!sameSide) {
      append(current, pending);
      pending = { frames: [], midis: [] };
    }
    pending.frames.push(frame);
    pending.midis.push(midi);
    if (pending.frames.length >= STEP_FRAMES) {
      close();
      current = pending;
      pending = { frames: [], midis: [] };
    }
  });
  if (current) append(current, pending);
  close();
  const notes = absorbSlides(mergeContinuations(segments.flatMap(splitAtRearticulations)))
    .filter((s) => duration(s) >= MIN_NOTE_SECONDS)
    .map(toNote);
  return foldOctaveLeaps(notes);
}

/** Mean pitch of a note so far, skipping its attack: the middle of any vibrato. */
function noteCentre(segment: Segment): number {
  const settled = segment.midis.length > ATTACK_FRAMES * 2 ? segment.midis.slice(ATTACK_FRAMES) : segment.midis;
  return settled.reduce((sum, m) => sum + m, 0) / settled.length;
}

/** Per-frame MIDI pitch (null when unvoiced), with isolated octave jumps folded back. */
function foldOctaveErrors(frames: PitchFrame[]): (number | null)[] {
  const raw = frames.map((f) => (f.frequency === null ? null : frequencyToMidi(f.frequency)));
  return raw.map((midi, index) => {
    if (midi === null) return null;
    const around = raw.slice(Math.max(0, index - NEIGHBOURHOOD), index + NEIGHBOURHOOD + 1).filter((m) => m !== null);
    const local = median(around as number[]);
    if (midi - local > OCTAVE_JUMP) return midi - 12;
    if (local - midi > OCTAVE_JUMP) return midi + 12;
    return midi;
  });
}

/**
 * A whole note read an octave off shows up as a leap of more than an octave from its neighbour.
 * Sung melodies rarely leap that far, so such notes are moved back by an octave (genuine octave
 * leaps, exactly 12 semitones, are kept).
 */
function foldOctaveLeaps(notes: SungNote[]): SungNote[] {
  const folded: SungNote[] = [];
  for (const note of notes) {
    const previous = folded.at(-1);
    let midi = note.midi;
    while (previous && midi - previous.midi > 12.5) midi -= 12;
    while (previous && previous.midi - midi > 12.5) midi += 12;
    folded.push({ ...note, midi });
  }
  return folded;
}
