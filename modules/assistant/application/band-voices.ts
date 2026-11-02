import {
  barEvents,
  eventPitches,
  isDrumKit,
  measureCapacity,
  midiPitch,
  soundingBeats,
  staffHandle,
  type Part,
  type Score,
} from "@/modules/score";

/** One note of a voice as it sounds: from its attack to its release (ties joined), in beats from the start. */
export type VoiceNote = { start: number; end: number; midi: number[]; bar: number; beat: number };

/** One pitched voice of the band: a melodic line as a listener follows it. */
export type VoiceLine = { part: Part; handle: string; voiceId: string; notes: VoiceNote[] };

const EPSILON = 1e-6;

/** Where each bar starts, in quarter beats from the start of the song. */
export function barStarts(score: Score): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const measure of score.measures) {
    starts.push(at);
    at += measureCapacity(measure.meter);
  }
  return starts;
}

/** Every voice of every pitched staff, as the notes it sounds: tied notes are one note. */
export function voiceLines(score: Score): VoiceLine[] {
  const starts = barStarts(score);
  return score.parts
    .filter((part) => !isDrumKit(part.instrument))
    .flatMap((part) =>
      part.staves.flatMap((staff) =>
        staff.voices.map((voice) => {
          const notes: VoiceNote[] = [];
          let tied = false;
          score.measures.forEach((measure, bar) => {
            let beat = 0;
            for (const event of barEvents(measure, voice.id)) {
              const length = soundingBeats(event);
              const midi = eventPitches(event).map(midiPitch);
              const start = starts[bar] + beat;
              const last = notes.at(-1);
              if (midi.length && tied && last && Math.abs(last.end - start) < EPSILON) last.end = start + length;
              else if (midi.length) notes.push({ start, end: start + length, midi, bar, beat });
              tied = Boolean(event.tie) && midi.length > 0;
              beat += length;
            }
          });
          const handle = staffHandle(score, staff.id) ?? part.id;
          const name = staff.voices.length > 1 && voice !== staff.voices[0] ? `${handle} v2` : handle;
          return { part, handle: name, voiceId: voice.id, notes };
        }),
      ),
    )
    .filter((line) => line.notes.length > 0);
}

/** The note a voice sounds at a moment, or null in a rest. */
export function soundingAt(line: VoiceLine, time: number): VoiceNote | null {
  for (const note of line.notes) {
    if (note.start > time + EPSILON) return null;
    if (note.end > time + EPSILON) return note;
  }
  return null;
}

const top = (note: VoiceNote) => Math.max(...note.midi);
const bottom = (note: VoiceNote) => Math.min(...note.midi);

/** The line's pitch for melodic checks: its top note (a chord's melody note). */
export const melodic = top;

/** The pitches two voices sound against each other: the upper voice's lowest note, the lower one's highest. */
export function against(upper: VoiceNote, lower: VoiceNote): [number, number] {
  return [bottom(upper), top(lower)];
}

/** The average pitch of a voice, to tell which of two sits higher. */
export const averagePitch = (line: VoiceLine) =>
  line.notes.reduce((sum, note) => sum + melodic(note), 0) / line.notes.length;
