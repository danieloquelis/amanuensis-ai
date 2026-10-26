import {
  durationNotation,
  locateEvent,
  inKey,
  isWithinOctaveRange,
  movePitch,
  pitchName,
  scoreKey,
  staffPosition,
  type DurationValue,
  type KeySignature,
  type Operation,
  type Pitch,
  type Score,
  type ScoreEvent,
  type Step,
} from "@/modules/score";

/** A score operation plus the short receipt shown to the user. */
export type Edit = { operation: Operation; receipt: string };

export const NOTE_DURATION_CHOICES = [
  { value: 4, label: "Whole" },
  { value: 2, label: "Half" },
  { value: 1, label: "Quarter" },
  { value: 0.5, label: "Eighth" },
  { value: 0.25, label: "Sixteenth" },
] as const;

/** Pitch used when a rest becomes a note (spelled in the key). */
const DEFAULT_NOTE_PITCH: Pitch = { step: "C", octave: 4, alter: 0 };

/** Moves a note by diatonic steps within the key; rests and spaces have no pitch to move. */
export function stepPitchEdit(score: Score, eventId: string, steps: number): Edit | null {
  const { event } = locateEvent(score, eventId);
  if (!event.pitch) return null;
  const pitch = movePitch(event.pitch, steps, scoreKey(score));
  return {
    operation: { type: "setPitch", eventId, pitch },
    receipt: `Changed ${pitchName(event.pitch)} to ${pitchName(pitch)}`,
  };
}

/** Adds or removes a dot while keeping the undotted written value. */
export function toggleDotOperation(event: ScoreEvent): Operation {
  const { base, dotted } = durationNotation(event.duration);
  const duration = (dotted ? base : base * 1.5) as DurationValue;
  return { type: "setDuration", eventId: event.id, duration };
}

/** Gives an event a pitch. A full-bar rest first shrinks to a quarter so one note doesn't fill the bar. */
function pitchOperation(event: ScoreEvent, pitch: Pitch): Operation {
  if (!event.measureRest) return { type: "setPitch", eventId: event.id, pitch };
  return {
    type: "batch",
    operations: [
      { type: "setDuration", eventId: event.id, duration: 1 },
      { type: "setPitch", eventId: event.id, pitch },
    ],
  };
}

/** Turns a note into a rest of the same length, or a rest into a note (C, spelled in the key). */
export function toggleRestOperation(event: ScoreEvent, key: KeySignature): Operation {
  if (event.pitch) return { type: "setPitch", eventId: event.id, pitch: null };
  return pitchOperation(event, inKey(DEFAULT_NOTE_PITCH, key));
}

/**
 * Typing a letter A–G: the event (note or rest) takes that pitch, spelled in the key, in the
 * octave nearest the note it replaces, or else the previous note, as notation editors do.
 */
export function letterNoteEdit(score: Score, eventId: string, step: Step): Edit {
  const { event } = locateEvent(score, eventId);
  const reference = event.pitch ?? previousPitch(score, eventId) ?? MIDDLE_LINE_PITCH;
  const candidates = [-1, 0, 1]
    .map((offset) => inKey({ step, octave: reference.octave + offset, alter: 0 }, scoreKey(score)))
    .filter(isWithinOctaveRange);
  const distance = (pitch: Pitch) => Math.abs(staffPosition(pitch) - staffPosition(reference));
  const pitch = candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
  return {
    operation: pitchOperation(event, pitch),
    receipt: event.pitch ? `Changed ${pitchName(event.pitch)} to ${pitchName(pitch)}` : `Added ${pitchName(pitch)}`,
  };
}

const MIDDLE_LINE_PITCH: Pitch = { step: "B", octave: 4, alter: 0 };

function previousPitch(score: Score, eventId: string): Pitch | null {
  let last: Pitch | null = null;
  for (const event of score.measures.flatMap((m) => m.events)) {
    if (event.id === eventId) return last;
    if (event.pitch) last = event.pitch;
  }
  return last;
}
