import { spellMidi, pitchName, type KeySignature } from "@/modules/score";
import { segmentNotes, spanFrames, type VoiceTake } from "@/modules/voice";

/** Notes the tracker heard less clearly than this are marked with "?". */
const CLEAR = 0.8;
const C_MAJOR: KeySignature = { fifths: 0, mode: "major" };
const seconds = (value: number) => value.toFixed(2);

/**
 * What one sung span sounds like before any notation: each note's start (seconds into the span),
 * pitch as sung (nearest semitone, octave as sung), and length. Compact text, cheap to read.
 */
export function hearNotes(take: VoiceTake | null, spanId: string) {
  const frames = take && spanFrames(take, spanId);
  if (!frames) throw new Error(`There is no sung span ${spanId}${take ? "" : " (no voice take this turn)"}.`);
  const notes = segmentNotes(frames);
  return {
    spanId,
    count: notes.length,
    notes: notes
      .map((note) => {
        const name = pitchName(spellMidi(Math.round(note.midi), C_MAJOR));
        return `${seconds(note.start)} ${name}${note.clarity < CLEAR ? "?" : ""} ${seconds(note.end - note.start)}s`;
      })
      .join(" · "),
  };
}
