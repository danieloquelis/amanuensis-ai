import { z } from "zod";
import { ARTICULATIONS, REPEAT_PASSES } from "../notation";
import { idSchema, MEASURE_WIDTH, meterSchema, pitchSchema, SCORE_LIMITS, tempoSchema } from "../schema";

export const OPERATION_BATCH_LIMIT = 64;

/** Written values in quarter-note beats, sixteenth through dotted whole. */
const durationSchema = z.union([
  z.literal(0.25),
  z.literal(0.375),
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(6),
]);
export type DurationValue = z.infer<typeof durationSchema>;

const measureIdsSchema = z.array(idSchema).min(1).max(SCORE_LIMITS.measures);

export const operationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("setMeasureWidth"),
    measureId: idSchema,
    width: z.number().min(MEASURE_WIDTH.min).max(MEASURE_WIDTH.max).nullable(),
  }),
  z.strictObject({ type: z.literal("setPitch"), eventId: idSchema, pitch: pitchSchema.nullable() }),
  z.strictObject({ type: z.literal("setDuration"), eventId: idSchema, duration: durationSchema }),
  z.strictObject({ type: z.literal("setTempo"), tempo: tempoSchema, measureId: idSchema.optional() }),
  z.strictObject({ type: z.literal("removeTempo"), measureId: idSchema }),
  z.strictObject({ type: z.literal("rename"), title: z.string().trim().min(1).max(100) }),
  z.strictObject({ type: z.literal("appendMeasure"), afterMeasureId: idSchema.optional() }),
  z.strictObject({ type: z.literal("deleteMeasure"), measureId: idSchema }),
  z.strictObject({ type: z.literal("duplicateMeasure"), measureId: idSchema }),
  z.strictObject({ type: z.literal("clearMeasure"), measureId: idSchema }),
  z.strictObject({
    type: z.literal("setMeter"),
    measureIds: measureIdsSchema,
    meter: meterSchema,
    policy: z.enum(["preserve", "scale"]),
  }),
  z.strictObject({
    type: z.literal("setArticulation"),
    eventId: idSchema,
    articulation: z.enum(ARTICULATIONS).nullable(),
  }),
  z.strictObject({
    type: z.literal("putAnnotation"),
    id: idSchema.optional(),
    targetId: idSchema,
    kind: z.enum(["text", "dynamic"]),
    text: z.string().trim().min(1).max(120),
  }),
  z.strictObject({ type: z.literal("removeNotation"), id: idSchema }),
  z.strictObject({
    type: z.literal("putRepeat"),
    id: idSchema.optional(),
    startMeasureId: idSchema,
    endMeasureId: idSchema,
    count: z.number().int().min(REPEAT_PASSES.min).max(REPEAT_PASSES.max),
  }),
  z.strictObject({ type: z.literal("removeEvent"), eventId: idSchema }),
  z.strictObject({ type: z.literal("moveEvent"), eventId: idSchema, beforeEventId: idSchema.nullable() }),
  z.strictObject({
    type: z.literal("replaceMeasure"),
    measureId: idSchema,
    events: z
      .array(z.strictObject({ pitch: pitchSchema.nullable(), duration: durationSchema }))
      .min(1)
      .max(SCORE_LIMITS.eventsPerMeasure),
  }),
]);

const batchSchema = z.strictObject({
  type: z.literal("batch"),
  operations: z.array(operationSchema).min(1).max(OPERATION_BATCH_LIMIT),
});

export const commandSchema = z.strictObject({
  requestId: z.string().regex(/^[\w-]{1,60}$/),
  expectedRevision: z.number().int().nonnegative(),
  operation: z.union([operationSchema, batchSchema]),
});

export type BasicOperation = z.infer<typeof operationSchema>;
export type OperationType = BasicOperation["type"];
export type OperationOf<T extends OperationType> = Extract<BasicOperation, { type: T }>;
export type Operation = BasicOperation | { type: "batch"; operations: BasicOperation[] };
export type Command = z.infer<typeof commandSchema>;
