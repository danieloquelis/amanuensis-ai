import { z } from "zod";
import { handleSchema } from "./fields";
import { INSTRUMENT_IDS } from "../instruments";
import { idSchema } from "../schema";

const partId = handleSchema.describe('A part by its handle in score text ("piano", "trumpet", "trumpet-2") or ID.');
const MIX_STEP = 0.05;

/** Operations on the ensemble: which instruments play, in what order, and how loud. */
export const ensembleOperationSchemas = [
  z
    .strictObject({
      type: z.literal("addPart"),
      instrument: z.enum(INSTRUMENT_IDS),
      name: z.string().trim().min(1).max(40).optional().describe("Shown name. Default: the instrument's name."),
      afterPartId: idSchema.optional().describe("Default: below the last part."),
    })
    .describe(
      'Add an instrument to the score: a new staff (whole-bar rests in every bar, ready for notes) below the others. Write its bars with score text lines like "bar 3 trumpet: …".',
    ),
  z
    .strictObject({ type: z.literal("removePart"), partId })
    .describe("Remove an instrument and all its notes. The last part cannot be removed."),
  z
    .strictObject({
      type: z.literal("movePart"),
      partId,
      beforePartId: idSchema.nullable().describe("The part it goes above; null puts it at the bottom."),
    })
    .describe("Reorder the instruments on the page; the music does not change."),
  z
    .strictObject({
      type: z.literal("renamePart"),
      partId,
      name: z.string().trim().min(1).max(40),
      abbreviation: z.string().trim().min(1).max(12).optional().describe('Shown from the second line, e.g. "Tpt."'),
    })
    .describe("Rename an instrument as shown on the score; its handle follows the new name."),
  z
    .strictObject({
      type: z.literal("setStaffCount"),
      partId,
      staves: z.union([z.literal(1), z.literal(2)]).describe("2: a piano's grand staff (treble and bass)."),
    })
    .describe(
      "Give a piano a second (bass) staff for the left hand, or go back to one staff once the second holds no notes.",
    ),
  z
    .strictObject({
      type: z.literal("setPartMix"),
      partId,
      volume: z.number().min(0).max(1).multipleOf(MIX_STEP).optional().describe("0–1. Default level: 0.8."),
      muted: z.boolean().optional().describe("true silences the part in playback."),
    })
    .describe("Set how loud a part plays, or mute it. Saved with the score and undoable; the notes do not change."),
] as const;
