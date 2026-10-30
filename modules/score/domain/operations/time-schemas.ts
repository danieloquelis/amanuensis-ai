import { z } from "zod";
import { SCORE_LIMITS } from "../schema";
import { beatSchema, handleSchema, measureId } from "./fields";

/** The most time one shift moves: a few bars either way. */
const MAX_SHIFT_BEATS = 48;
const SMALLEST_VALUE = 0.125;

const line = handleSchema
  .optional()
  .describe(
    'Only this line ("v2", "trumpet", "piano.2/v2"). Default: every line of the score, chord symbols included, so the parts stay together.',
  );

/** Operations that move music in time across barlines, re-barring it. */
export const timeOperationSchemas = [
  z
    .strictObject({
      type: z.literal("shiftTime"),
      measureId,
      beat: beatSchema,
      beats: z
        .number()
        .min(-MAX_SHIFT_BEATS)
        .max(MAX_SHIFT_BEATS)
        .multipleOf(SMALLEST_VALUE)
        .refine((value) => value !== 0, "Give how far to move: not 0.")
        .describe(
          "Quarter beats. Positive inserts that much silence there, pushing the music after it later; negative removes that much from there, pulling the music after it earlier (notes inside go, a note across the cut gets shorter).",
        ),
      voiceId: line,
    })
    .describe(
      "Insert or remove time at a point, re-barring everything after it (notes crossing a barline are tied, rests rewritten). E.g. remove a leading rest so the tune starts on beat 1 (beats -1 at bar 1 beat 0), or add a beat of silence. One edit instead of rewriting every following bar.",
    ),
  z
    .strictObject({
      type: z.literal("stretchTime"),
      measureIds: z
        .array(measureId)
        .min(1)
        .max(SCORE_LIMITS.measures)
        .describe("The bars to stretch, consecutive, in order."),
      factor: z
        .union([z.literal(2), z.literal(0.5)])
        .describe("2 doubles every note value (twice as slow, twice the bars); 0.5 halves them (twice as fast)."),
      voiceId: line,
    })
    .describe(
      "Augment or diminish a passage: multiply its note values, re-barring it; the music after it moves by the change. E.g. 'make it twice as slow', 'double the note values of bars 1–4'.",
    ),
] as const;
