import {
  durationNotation,
  locateEvent,
  movePitch,
  pitchName,
  type DurationValue,
  type Operation,
  type Pitch,
  type Score,
  type ScoreEvent,
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

/** Pitch used when a rest or empty space becomes a note. */
export const DEFAULT_NOTE_PITCH: Pitch = { step: "C", octave: 4, alter: 0 };

/** Moves a note by diatonic steps; rests and spaces have no pitch to move. */
export function stepPitchEdit(score: Score, eventId: string, steps: number): Edit | null {
  const { event } = locateEvent(score, eventId);
  if (!event.pitch) return null;
  const pitch = movePitch(event.pitch, steps);
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

/**
 * Turns a note into a rest, or a rest/space into a note. A full-bar rest first shrinks to a
 * quarter so the new note does not fill the whole bar.
 */
export function toggleRestOperation(event: ScoreEvent): Operation {
  if (event.measureRest) {
    return {
      type: "batch",
      operations: [
        { type: "setDuration", eventId: event.id, duration: 1 },
        { type: "setPitch", eventId: event.id, pitch: DEFAULT_NOTE_PITCH },
      ],
    };
  }
  return { type: "setPitch", eventId: event.id, pitch: event.pitch ? null : DEFAULT_NOTE_PITCH };
}
