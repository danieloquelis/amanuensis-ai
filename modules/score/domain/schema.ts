import { z } from "zod";
import { CHORD_QUALITY_NAMES, type ChordQuality } from "./chords";
import { KEY_FIFTHS } from "./key";
import { MARK_KINDS, SECTION_LABEL_MAX } from "./navigation";
import { ARTICULATIONS, REPEAT_PASSES } from "./notation";
import { OCTAVE_RANGE, STEPS } from "./pitch";

export const TEMPO_RANGE = { min: 40, max: 200 } as const;
/** Engraving override for a bar's width, in scene units. Layout never draws a bar narrower than its content needs. */
export const MEASURE_WIDTH = { min: 100, max: 720 } as const;
export const SCORE_LIMITS = {
  measures: 32,
  eventsPerMeasure: 32,
  annotations: 128,
  repeats: 16,
  chords: 256,
  marks: 64,
  slurs: 64,
};
/** How far a slur's middle may be raised (rounder) or lowered (flatter) from its automatic shape, in scene units. */
export const SLUR_LIFT = { min: -30, max: 80 } as const;
/** How far an indication may be dragged from its anchor, in scene units. */
export const LABEL_OFFSET_LIMIT = { x: 600, y: 300 } as const;

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
  /** `null` is a rest. */
  pitch: pitchSchema.nullable(),
  measureRest: z.literal(true).optional(),
  articulation: z.enum(ARTICULATIONS).optional(),
  /** Tied to the next note in score order (same pitch), across a barline too. */
  tie: z.literal(true).optional(),
});

const measureSchema = z.strictObject({
  width: z.number().min(MEASURE_WIDTH.min).max(MEASURE_WIDTH.max).optional(),
  id: idSchema,
  meter: meterSchema,
  events: z.array(eventSchema).min(1).max(SCORE_LIMITS.eventsPerMeasure),
  tempo: tempoSchema.optional(),
  /** Lead-sheet display: rhythm slashes (play freely on the chord) or a repeat of the previous bar. */
  style: z.enum(["slashes", "repeat"]).optional(),
  /** Rehearsal mark such as "A", "B" or "Verse", boxed above the bar. */
  section: z.string().trim().min(1).max(SECTION_LABEL_MAX).optional(),
});

/** Free placement of an indication relative to its anchor. */
export const labelOffsetSchema = z.strictObject({
  x: z.number().min(-LABEL_OFFSET_LIMIT.x).max(LABEL_OFFSET_LIMIT.x),
  y: z.number().min(-LABEL_OFFSET_LIMIT.y).max(LABEL_OFFSET_LIMIT.y),
});

export const annotationSchema = z.strictObject({
  id: idSchema,
  /** A note, rest or measure ID. */
  targetId: idSchema,
  kind: z.enum(["text", "dynamic"]),
  text: z.string().trim().min(1).max(120),
  offset: labelOffsetSchema.optional(),
});

export const chordRootSchema = z.strictObject({
  step: z.enum(STEPS),
  alter: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

/** A chord symbol sounding from `beat` (quarter beats into the bar) until the next chord. */
export const chordSchema = z.strictObject({
  id: idSchema,
  measureId: idSchema,
  beat: z.number().min(0).max(12).multipleOf(0.125),
  root: chordRootSchema,
  quality: z.enum(CHORD_QUALITY_NAMES as [ChordQuality, ...ChordQuality[]]),
  bass: chordRootSchema.optional(),
});

/**
 * A navigation mark on a bar: segno or coda at its start; Fine, To Coda, D.C. or D.S. at its end.
 * A score may have any number of each.
 */
export const markSchema = z.strictObject({
  id: idSchema,
  measureId: idSchema,
  kind: z.enum(MARK_KINDS),
});

/** A slur: the notes from the start to the end note, in score order, are one legato phrase. */
export const slurSchema = z.strictObject({
  id: idSchema,
  startEventId: idSchema,
  endEventId: idSchema,
  /** Layout only: the arc's middle this much further from the notes (negative: flatter). */
  lift: z.number().min(SLUR_LIFT.min).max(SLUR_LIFT.max).optional(),
});

export const repeatSchema = z.strictObject({
  id: idSchema,
  startMeasureId: idSchema,
  endMeasureId: idSchema,
  /** Total passes, including the first. */
  count: z.number().int().min(REPEAT_PASSES.min).max(REPEAT_PASSES.max),
});

/** Circle-of-fifths position: positive counts sharps, negative counts flats. */
export const keySignatureSchema = z.strictObject({
  fifths: z.number().int().min(KEY_FIFTHS.min).max(KEY_FIFTHS.max),
  mode: z.enum(["major", "minor"]),
});

export const scoreSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id: idSchema,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  title: z.string().trim().min(1).max(100),
  tempo: tempoSchema,
  /** Global key signature; absent means C major. Display only: pitches store their own alteration. */
  key: keySignatureSchema.optional(),
  measures: z.array(measureSchema).min(1).max(SCORE_LIMITS.measures),
  annotations: z.array(annotationSchema).max(SCORE_LIMITS.annotations),
  repeats: z.array(repeatSchema).max(SCORE_LIMITS.repeats),
  /** Optional in files written before chord symbols existed. */
  chords: z.array(chordSchema).max(SCORE_LIMITS.chords).default([]),
  marks: z.array(markSchema).max(SCORE_LIMITS.marks).default([]),
  slurs: z.array(slurSchema).max(SCORE_LIMITS.slurs).default([]),
});

export type Pitch = z.infer<typeof pitchSchema>;
export type Meter = z.infer<typeof meterSchema>;
export type KeySignature = z.infer<typeof keySignatureSchema>;
export type ScoreEvent = z.infer<typeof eventSchema>;
export type Measure = z.infer<typeof measureSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type Repeat = z.infer<typeof repeatSchema>;
export type Chord = z.infer<typeof chordSchema>;
export type Mark = z.infer<typeof markSchema>;
export type Slur = z.infer<typeof slurSchema>;
export type LabelOffset = z.infer<typeof labelOffsetSchema>;
export type Score = z.infer<typeof scoreSchema>;
