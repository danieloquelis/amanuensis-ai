import { z } from "zod";
import { DRUM_PIECE_CODES, DRUM_PIECES, MAX_DRUM_HITS } from "../drums";
import { GROOVE_NAMES, GROOVES } from "../grooves";
import { idSchema, SCORE_LIMITS } from "../schema";
import { eventId, handleSchema } from "./fields";

const pieces = DRUM_PIECE_CODES.map((code) => `${code} (${DRUM_PIECES[code].name})`).join(", ");
const grooves = GROOVE_NAMES.map((name) => `${name} (${Object.keys(GROOVES[name]).join(", ")})`).join(", ");

/** The pieces of one drum hit. */
export const drumHitSchema = z
  .array(z.enum(DRUM_PIECE_CODES))
  .min(1)
  .max(MAX_DRUM_HITS)
  .describe(`Kit pieces struck together: ${pieces}.`);

/** Drum kit: single hits, and whole grooves. */
export const drumOperationSchemas = [
  z
    .strictObject({
      type: z.literal("setDrums"),
      eventId,
      drums: drumHitSchema.nullable().describe(`Kit pieces struck together (${pieces}); null makes a rest.`),
    })
    .describe(
      "Set what a note or rest of a drum part strikes, keeping its length: hands (cymbals, snare, toms) in voice 1, feet (kick, hatfoot) in voice 2.",
    ),
  z
    .strictObject({
      type: z.literal("putGroove"),
      partId: handleSchema.optional().describe("The drum part. Default: the first one."),
      measureIds: z.array(idSchema).min(1).max(SCORE_LIMITS.measures).describe('The bars, e.g. ["1", "2", "3", "4"].'),
      groove: z
        .enum(GROOVE_NAMES as [string, ...string[]])
        .describe(`The groove, with the meters it is written for: ${grooves}.`),
      fill: z
        .boolean()
        .optional()
        .describe(
          "End with a fill down the toms in the second half of the last bar, and a crash on the next bar's downbeat.",
        ),
    })
    .describe(
      "Write a drum groove into bars of a drum part, hands and feet, replacing what they held: the quick way to a beat. Adjust single bars afterwards with score text.",
    ),
] as const;
