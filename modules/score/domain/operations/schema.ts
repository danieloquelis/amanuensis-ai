import { z } from "zod";
import { INSTRUMENT_IDS } from "../instruments";
import { ARTICULATIONS } from "../notation";
import { MAX_CHORD_NOTES } from "../stacks";
import { idSchema, keySignatureSchema, meterSchema, pitchSchema, SCORE_LIMITS, tempoSchema } from "../schema";

import { durationSchema, eventId, measureId } from "./fields";
import { NEW_SCORE_DEFAULTS } from "./new-score";
import { notationOperationSchemas } from "./notation-schemas";
import { measureOperationSchemas } from "./measure-schemas";
import { partOperationSchemas } from "./part-schemas";
import { voiceOperationSchemas } from "./voice-schemas";
import { copyOperationSchemas } from "./copy-schemas";
import { drumOperationSchemas } from "./drum-schemas";
import { ensembleOperationSchemas } from "./ensemble-schemas";
import { phraseOperationSchemas } from "./phrase-schemas";
import { timeOperationSchemas } from "./time-schemas";

/** Room for a whole score written at once: 8 parts × 32 bars of notes, with chords and sections. */
export const OPERATION_BATCH_LIMIT = 1024;
export type { DurationValue } from "./fields";

export const operationSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      type: z.literal("setPitch"),
      eventId,
      pitch: pitchSchema.nullable().describe("null makes a rest."),
    })
    .describe(
      "Give a note or rest a pitch, or turn it into a rest. A whole-bar rest keeps its length. Tied notes change together; a chord moves as a whole, its lowest note to this pitch.",
    ),
  z
    .strictObject({
      type: z.literal("setNotes"),
      eventId,
      pitches: z
        .array(pitchSchema)
        .min(1)
        .max(MAX_CHORD_NOTES)
        .describe("Every note sounding together, in any order; one pitch makes a plain note."),
    })
    .describe(
      "Several notes on one stem, played together: a chord within the voice (a piano chord, a guitar double stop). Tied notes change together.",
    ),
  z
    .strictObject({ type: z.literal("setDuration"), eventId, duration: durationSchema.describe("Quarter-note beats.") })
    .describe("Change a note's written value. Growing uses only the rests after it; shrinking leaves rests."),
  z.strictObject({ type: z.literal("removeEvent"), eventId }).describe("Turn a note into a rest of the same length."),
  z
    .strictObject({
      type: z.literal("moveEvent"),
      eventId,
      beforeEventId: idSchema
        .nullable()
        .describe('The note or rest to move before ("2#3"), in the same bar; null moves to the end.'),
    })
    .describe("Reorder a note within its bar."),
  z
    .strictObject({
      type: z.literal("setArticulation"),
      eventId,
      articulation: z.enum(ARTICULATIONS).nullable().describe("null removes it. Rests take only fermata."),
    })
    .describe("Set or clear a note's articulation."),
  z
    .strictObject({
      type: z.literal("setTie"),
      eventId,
      tied: z.boolean().describe("false removes the tie."),
    })
    .describe(
      "Tie a note to the next note, also across a barline, so they sound as one held note. The next note or rest takes this note's pitch.",
    ),
  z
    .strictObject({
      type: z.literal("setTempo"),
      tempo: tempoSchema.describe("Quarter-note BPM."),
      measureId: idSchema.optional().describe("Omit for the global tempo; give a bar for a tempo change there."),
    })
    .describe("Set the global tempo or a tempo change at a bar."),
  z.strictObject({ type: z.literal("removeTempo"), measureId }).describe("Remove a bar's tempo change."),
  z
    .strictObject({ type: z.literal("setKey"), key: keySignatureSchema })
    .describe("Set the key signature for the whole score. Written pitches keep their spelling."),
  z.strictObject({ type: z.literal("rename"), title: z.string().trim().min(1).max(100) }).describe("Rename the score."),
  z
    .strictObject({
      type: z.literal("newScore"),
      title: z.string().trim().min(1).max(100).optional().describe(`Default: "${NEW_SCORE_DEFAULTS.title}".`),
      meter: meterSchema.optional().describe("Default: 4/4."),
      bars: z
        .number()
        .int()
        .min(1)
        .max(SCORE_LIMITS.measures)
        .optional()
        .describe(`Empty bars. Default: ${NEW_SCORE_DEFAULTS.bars}.`),
      tempo: tempoSchema.optional().describe(`Quarter-note BPM. Default: ${NEW_SCORE_DEFAULTS.tempo}.`),
      key: keySignatureSchema.optional().describe("Default: C major."),
      instrument: z.enum(INSTRUMENT_IDS).optional().describe("Default: piano."),
      instruments: z
        .array(z.enum(INSTRUMENT_IDS))
        .min(1)
        .max(SCORE_LIMITS.parts)
        .optional()
        .describe("Several instruments, top to bottom (overrides instrument)."),
    })
    .describe(
      "Start a new song: replace the whole score with empty bars and nothing else. Only when the musician asks to start over or begin a new piece. One undoable edit.",
    ),
  ...notationOperationSchemas,
  ...phraseOperationSchemas,
  ...timeOperationSchemas,
  ...measureOperationSchemas,
  ...partOperationSchemas,
  ...voiceOperationSchemas,
  ...copyOperationSchemas,
  ...ensembleOperationSchemas,
  ...drumOperationSchemas,
]);

const batchSchema = z
  .strictObject({
    type: z.literal("batch"),
    operations: z.array(operationSchema).min(1).max(OPERATION_BATCH_LIMIT),
  })
  .describe("Several operations applied in order as one edit and one undo step; all or nothing.");

export const commandSchema = z.strictObject({
  requestId: z
    .string()
    .regex(/^[\w-]{1,60}$/)
    .describe("Unique per edit; retrying with the same ID is harmless. New IDs in the result derive from it."),
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .describe("The revision you read. The edit is rejected if the score changed since; read again and replan."),
  operation: z.union([operationSchema, batchSchema]),
});

/** The operations that have a field of this name ("key" → newScore, setKey): to point a misplaced field to its home. */
export function operationsTaking(field: string): string[] {
  return operationSchema.options
    .filter((option) => field !== "type" && field in option.shape)
    .map((option) => option.shape.type.value);
}

export type BasicOperation = z.infer<typeof operationSchema>;
export type OperationType = BasicOperation["type"];
export type OperationOf<T extends OperationType> = Extract<BasicOperation, { type: T }>;
export type Operation = BasicOperation | { type: "batch"; operations: BasicOperation[] };
export type Command = z.infer<typeof commandSchema>;
