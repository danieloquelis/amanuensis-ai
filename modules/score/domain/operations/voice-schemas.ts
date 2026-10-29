import { z } from "zod";
import { idSchema, SCORE_LIMITS } from "../schema";

const measureIdsSchema = z.array(idSchema).min(1).max(SCORE_LIMITS.measures);
/** Voices beyond the staff's main line, as numbered on the staff. */
const SECOND_VOICE = 2;

/** Operations that add or remove the independent lines (voices) of a staff. */
export const voiceOperationSchemas = [
  z
    .strictObject({
      type: z.literal("addVoiceBars"),
      staffId: idSchema.optional().describe("Default: the first staff."),
      voice: z
        .number()
        .int()
        .min(SECOND_VOICE)
        .max(SCORE_LIMITS.voicesPerStaff)
        .describe("Which line: 2 is the second voice (stems down), under the main line."),
      measureIds: z.array(idSchema).min(1).max(SCORE_LIMITS.measures).describe('Bars, e.g. ["1", "2"].'),
    })
    .describe(
      "A second independent line on the staff, sounding with the main line in its own rhythm, e.g. a bass under the melody (guitar thumb and fingers); not for fitting notes or fixing a rhythm. Each listed bar without it gets a whole-bar rest in that voice, ready for notes; write them with replaceMeasure and its voiceId. Each voice fills its bars on its own; voice 1 stems up, voice 2 down.",
    ),
  z
    .strictObject({
      type: z.literal("removeVoiceBars"),
      voiceId: idSchema.describe('The voice, e.g. "v2" (the second voice of the first staff).'),
      measureIds: measureIdsSchema.optional().describe("Default: every bar, and the voice leaves the staff."),
    })
    .describe("Remove a voice from bars (its notes go), or from the whole staff. The main line stays."),
] as const;
