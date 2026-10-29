import { z } from "zod";
import { idSchema, MEASURE_WIDTH, meterSchema, pitchSchema, SCORE_LIMITS } from "../schema";

import { durationSchema, measureId } from "./fields";

const measureIdsSchema = z.array(idSchema).min(1).max(SCORE_LIMITS.measures);

/** Operations on whole bars: writing, adding, removing, clearing, meter and width. */
export const measureOperationSchemas = [
  z
    .strictObject({
      type: z.literal("replaceMeasure"),
      measureId,
      events: z
        .array(
          z.strictObject({
            pitch: pitchSchema.nullable(),
            duration: durationSchema,
            tie: z
              .boolean()
              .optional()
              .describe(
                "Tie into the next note, which must have the same pitch; the last note ties into the next bar.",
              ),
          }),
        )
        .min(1)
        .max(SCORE_LIMITS.eventsPerMeasure)
        .describe("New notes and rests; their beats must add up exactly to the bar's length."),
      voiceId: idSchema
        .optional()
        .describe(
          'Which line of the bar to write, e.g. "v2" for the second voice (add it with addVoiceBars first, in the same batch is fine). Default: the main line.',
        ),
    })
    .describe(
      "Write a whole bar of new music, e.g. a sung phrase. A note held over the barline is written as tied notes. Indications on the old notes are removed.",
    ),
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
    .strictObject({
      type: z.literal("clearMeasure"),
      measureId,
      staffId: idSchema.optional().describe("Clear only this staff. Default: every staff."),
      voiceId: idSchema
        .optional()
        .describe('Rest only this line, e.g. "v2", keeping the other voices. Default: the whole bar.'),
    })
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
] as const;
