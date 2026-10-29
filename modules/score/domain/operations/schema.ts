import { z } from "zod";
import { ARTICULATIONS } from "../notation";
import {
  idSchema,
  keySignatureSchema,
  MEASURE_WIDTH,
  meterSchema,
  pitchSchema,
  SCORE_LIMITS,
  tempoSchema,
} from "../schema";

import { durationSchema, eventId, measureId } from "./fields";
import { NEW_SCORE_DEFAULTS } from "./new-score";
import { notationOperationSchemas } from "./notation-schemas";

export const OPERATION_BATCH_LIMIT = 64;
export type { DurationValue } from "./fields";

const measureIdsSchema = z.array(idSchema).min(1).max(SCORE_LIMITS.measures);

export const operationSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      type: z.literal("setPitch"),
      eventId,
      pitch: pitchSchema.nullable().describe("null makes a rest."),
    })
    .describe("Give a note or rest a pitch, or turn it into a rest. A whole-bar rest keeps its length."),
  z
    .strictObject({ type: z.literal("setDuration"), eventId, duration: durationSchema.describe("Quarter-note beats.") })
    .describe("Change a note's written value. Growing uses only the rests after it; shrinking leaves rests."),
  z.strictObject({ type: z.literal("removeEvent"), eventId }).describe("Turn a note into a rest of the same length."),
  z
    .strictObject({
      type: z.literal("moveEvent"),
      eventId,
      beforeEventId: idSchema.nullable().describe("Event to move before, in the same bar; null moves to the end."),
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
      type: z.literal("replaceMeasure"),
      measureId,
      events: z
        .array(z.strictObject({ pitch: pitchSchema.nullable(), duration: durationSchema }))
        .min(1)
        .max(SCORE_LIMITS.eventsPerMeasure)
        .describe("New notes and rests; their beats must add up exactly to the bar's length."),
    })
    .describe("Write a whole bar of new music, e.g. a sung phrase. Indications on the old notes are removed."),
  z
    .strictObject({
      type: z.literal("appendMeasure"),
      afterMeasureId: idSchema.optional().describe("Default: last bar."),
    })
    .describe("Insert an empty bar (a whole-bar rest) with the same meter."),
  z
    .strictObject({ type: z.literal("deleteMeasure"), measureId })
    .describe("Delete a bar and everything anchored to it."),
  z
    .strictObject({ type: z.literal("duplicateMeasure"), measureId })
    .describe("Copy a bar with its chords and indications right after it."),
  z
    .strictObject({ type: z.literal("clearMeasure"), measureId })
    .describe("Replace a bar's notes with a whole-bar rest."),
  z
    .strictObject({
      type: z.literal("setMeter"),
      measureIds: measureIdsSchema,
      meter: meterSchema,
      policy: z
        .enum(["preserve", "scale", "auto"])
        .describe(
          "preserve keeps note values (adds/trims rests), scale fits proportionally, auto tries preserve first.",
        ),
      extend: z
        .boolean()
        .optional()
        .describe("Also change the following bars up to the next time-signature change, like a notation editor."),
    })
    .describe("Change the time signature of bars. Never cuts notes or invents tuplets."),
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
    })
    .describe(
      "Start a new song: replace the whole score with empty bars and nothing else. Only when the musician asks to start over or begin a new piece. One undoable edit.",
    ),
  ...notationOperationSchemas,
  z
    .strictObject({
      type: z.literal("setMeasureWidth"),
      measureId,
      width: z
        .number()
        .min(MEASURE_WIDTH.min)
        .max(MEASURE_WIDTH.max)
        .nullable()
        .describe("null restores automatic spacing."),
    })
    .describe("Layout only: set a bar's engraved width. Never changes the music."),
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

export type BasicOperation = z.infer<typeof operationSchema>;
export type OperationType = BasicOperation["type"];
export type OperationOf<T extends OperationType> = Extract<BasicOperation, { type: T }>;
export type Operation = BasicOperation | { type: "batch"; operations: BasicOperation[] };
export type Command = z.infer<typeof commandSchema>;
