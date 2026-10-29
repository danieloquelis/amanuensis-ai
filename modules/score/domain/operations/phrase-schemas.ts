import { z } from "zod";
import { idSchema, SCORE_LIMITS, SLUR_LIFT } from "../schema";

import { eventId } from "./fields";

/** An octave in staff steps; transposition reaches up to three octaves either way. */
const OCTAVE_STEPS = 7;
const TRANSPOSE_LIMIT = 3 * OCTAVE_STEPS;

/** Operations on a run of notes: slurs and transposition. */
export const phraseOperationSchemas = [
  z
    .strictObject({
      type: z.literal("putSlur"),
      startEventId: eventId.describe("First note of the phrase."),
      endEventId: eventId.describe("Last note of the phrase; may be in a later bar."),
    })
    .describe(
      "Slur a phrase: its notes play legato, sung on one breath or one syllable over several notes. Rests at either end are left out. Replaces any slur it overlaps; remove one with removeNotation.",
    ),
  z
    .strictObject({
      type: z.literal("shapeSlur"),
      id: idSchema.describe("Slur ID."),
      lift: z
        .number()
        .min(SLUR_LIFT.min)
        .max(SLUR_LIFT.max)
        .nullable()
        .describe(
          "Scene units (12 per staff space) the arc's middle moves away from the notes; negative flattens; null restores the automatic shape.",
        ),
    })
    .describe(
      "Layout only: make a slur's arc rounder or flatter, e.g. to clear an accidental. Never changes the music.",
    ),
  z
    .strictObject({
      type: z.literal("transpose"),
      eventIds: z
        .array(idSchema)
        .min(1)
        .max(SCORE_LIMITS.measures * SCORE_LIMITS.eventsPerMeasure)
        .describe("Notes to move; rests among them are skipped."),
      steps: z
        .number()
        .int()
        .min(-TRANSPOSE_LIMIT)
        .max(TRANSPOSE_LIMIT)
        .describe(
          "Staff steps: 7 is an octave up, -2 a third down. Octaves keep accidentals; other moves stay in the key.",
        ),
    })
    .describe("Move notes up or down, e.g. a phrase an octave higher. Tied notes move together."),
] as const;
