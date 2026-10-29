import { z } from "zod";
import { idSchema, SCORE_LIMITS } from "../schema";
import { eventId, measureId } from "./fields";

/** Copy and paste: whole bars, or a run of notes, written again elsewhere. */
export const copyOperationSchemas = [
  z
    .strictObject({
      type: z.literal("copyBars"),
      measureIds: z
        .array(idSchema)
        .min(1)
        .max(SCORE_LIMITS.measures)
        .describe('The bars to copy, in the order to write them, e.g. ["1", "2"].'),
      toMeasureId: measureId.describe("The first bar to write them into; bars are added past the end."),
    })
    .describe(
      "Copy whole bars (every voice, meter, chord symbols, dynamics and text, slurs within them) over the bars from toMeasureId on, e.g. repeat bars 1–2 at bar 5. What those bars held is replaced; sections and marks stay.",
    ),
  z
    .strictObject({
      type: z.literal("copyNotes"),
      eventIds: z
        .array(idSchema)
        .min(1)
        .max(SCORE_LIMITS.events)
        .describe('A run of consecutive notes and rests of one voice, e.g. ["2#1", "2#2", "2#3"]; may cross bars.'),
      toEventId: eventId.describe("Where the copy starts: it overwrites from this note or rest on, in its voice."),
    })
    .describe(
      "Copy a run of notes over the music from toEventId on, in that voice, across barlines (a note crossing one is split and tied). The rhythm is kept; what was there is overwritten, and a note cut at the end of the copy leaves a rest.",
    ),
] as const;
