import { z } from "zod";
import { handleSchema } from "./fields";
import { INSTRUMENT_IDS } from "../instruments";
import { CLEFS } from "../schema";

/** Operations on parts and staves: the instrument a part is played on, and a staff's clef. */
export const partOperationSchemas = [
  z
    .strictObject({
      type: z.literal("setInstrument"),
      partId: handleSchema.optional().describe("Default: the first part."),
      instrument: z
        .enum(INSTRUMENT_IDS)
        .describe("trumpet is a B♭ trumpet (written a major 2nd above its sound); guitar is written an octave up."),
      name: z.string().trim().min(1).max(40).optional().describe("Shown name. Default: the instrument's name."),
    })
    .describe(
      "Change what a part is played on. Notes keep their sound (pitches are concert pitch); the clef follows the instrument; notes outside its range are flagged, not changed.",
    ),
  z
    .strictObject({
      type: z.literal("setClef"),
      staffId: handleSchema.optional().describe("Default: the first staff."),
      clef: z
        .enum(CLEFS)
        .describe("treble8vb: treble clef with an 8 below, sounding an octave lower (guitar). percussion: drums only."),
    })
    .describe("Change a staff's clef, e.g. a guitar in plain treble. Notes keep their sound."),
] as const;
