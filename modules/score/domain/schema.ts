import { z } from "zod";
import { ARTICULATIONS, REPEAT_PASSES } from "./notation";
import { OCTAVE_RANGE, STEPS } from "./pitch";

export const TEMPO_RANGE = { min: 40, max: 200 } as const;
/** Engraving override for a bar's width, in scene units. */
export const MEASURE_WIDTH = { min: 260, max: 468 } as const;
export const SCORE_LIMITS = { measures: 32, eventsPerMeasure: 32, annotations: 128, repeats: 16 };

export const idSchema = z.string().regex(/^[\w-]{1,100}$/);

export const tempoSchema = z.number().int().min(TEMPO_RANGE.min).max(TEMPO_RANGE.max);

export const pitchSchema = z.strictObject({
  step: z.enum(STEPS),
  alter: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  octave: z.number().int().min(OCTAVE_RANGE.min).max(OCTAVE_RANGE.max),
});

export const meterSchema = z.strictObject({
  numerator: z.number().int().min(2).max(12),
  denominator: z.union([z.literal(4), z.literal(8)]),
});

const fractionSchema = z.strictObject({
  numerator: z.number().int().min(1).max(48),
  denominator: z.number().int().min(1).max(8),
});

export const eventSchema = z.strictObject({
  id: idSchema,
  duration: fractionSchema,
  /** `null` is a rest, or unfinished space when `gap` is set. */
  pitch: pitchSchema.nullable(),
  /** Editable space left by shortening a note; not engraved as a rest. */
  gap: z.literal(true).optional(),
  measureRest: z.literal(true).optional(),
  articulation: z.enum(ARTICULATIONS).optional(),
});

const measureSchema = z.strictObject({
  width: z.number().min(MEASURE_WIDTH.min).max(MEASURE_WIDTH.max).optional(),
  id: idSchema,
  meter: meterSchema,
  events: z.array(eventSchema).min(1).max(SCORE_LIMITS.eventsPerMeasure),
  tempo: tempoSchema.optional(),
});

export const annotationSchema = z.strictObject({
  id: idSchema,
  /** A note, rest or measure ID. */
  targetId: idSchema,
  kind: z.enum(["text", "dynamic"]),
  text: z.string().trim().min(1).max(120),
});

export const repeatSchema = z.strictObject({
  id: idSchema,
  startMeasureId: idSchema,
  endMeasureId: idSchema,
  /** Total passes, including the first. */
  count: z.number().int().min(REPEAT_PASSES.min).max(REPEAT_PASSES.max),
});

export const scoreSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id: idSchema,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  title: z.string().trim().min(1).max(100),
  tempo: tempoSchema,
  measures: z.array(measureSchema).min(1).max(SCORE_LIMITS.measures),
  annotations: z.array(annotationSchema).max(SCORE_LIMITS.annotations),
  repeats: z.array(repeatSchema).max(SCORE_LIMITS.repeats),
});

export type Pitch = z.infer<typeof pitchSchema>;
export type Meter = z.infer<typeof meterSchema>;
export type ScoreEvent = z.infer<typeof eventSchema>;
export type Measure = z.infer<typeof measureSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type Repeat = z.infer<typeof repeatSchema>;
export type Score = z.infer<typeof scoreSchema>;
