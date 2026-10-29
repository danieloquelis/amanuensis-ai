import { z } from "zod";
import { idSchema } from "../schema";

/** Written values in quarter-note beats, sixteenth through dotted whole. */
export const durationSchema = z.union([
  z.literal(0.25),
  z.literal(0.375),
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(6),
]);
export type DurationValue = z.infer<typeof durationSchema>;

// Each variant and non-obvious field carries a description: these schemas are also the AI tool
// schema, so the descriptions are the agent's documentation.
export const eventId = idSchema.describe(
  'A note or rest: "2#5" (the 5th note or rest of bar 2) or "2:3" (bar 2, beat 3); in the second voice "2v2#1" or "2v2:3". IDs work too.',
);
export const measureId = idSchema.describe('A bar by number, e.g. "2". IDs work too.');
export const beatSchema = z
  .number()
  .min(0)
  .max(12)
  .multipleOf(0.125)
  .describe("Position inside the bar in quarter-note beats from 0 (beat 1 = 0, beat 3 in 4/4 = 2).");
