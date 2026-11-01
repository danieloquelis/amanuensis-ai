import { z } from "zod";
import { eventId } from "./fields";

/** Operations that make and undo triplets. */
export const tupletOperationSchemas = [
  z
    .strictObject({
      type: z.literal("makeTuplet"),
      eventId: eventId.describe('The note or rest to split, e.g. "2#3"; an undotted eighth, quarter or half.'),
    })
    .describe(
      "Split one value into a triplet of three in its time: a quarter becomes three triplet eighths, a half three triplet quarters, an eighth three triplet sixteenths. The first keeps the note; the other two are rests, ready for setPitch. Simple meters only, starting on a beat.",
    ),
  z
    .strictObject({
      type: z.literal("removeTuplet"),
      eventId: eventId.describe("Any note or rest of the triplet."),
    })
    .describe("Turn a triplet back into one plain value of its length, keeping its first note."),
] as const;
