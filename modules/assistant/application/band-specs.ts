import { z } from "zod";
import { INSTRUMENT_IDS } from "@/modules/score";
import type { ToolSpec } from "./model-port";
import { noteSchema } from "./musician-brief";
import { tuneSchema } from "./tune-plan";
import { toolParameters } from "./tool-definitions";

/** The bandleader's tools in Band Mode: what each takes and what it does, as the model reads it. */
export const BAND_ARRANGE = "band_arrange";
export const BAND_LISTEN = "band_listen";
export const BAND_REHEARSE = "band_rehearse";
/** Rehearsal rounds a turn may have: the one after the band first plays, and one more. */
export const MAX_REHEARSALS = 2;

export const arrangeSchema = z.strictObject({
  feel: z.string().trim().min(1).max(300).describe("The style and feel the whole band plays in, and the passage."),
  parts: z
    .array(
      z.strictObject({
        part: z
          .string()
          .describe(
            'An existing part\'s handle ("piano", "bass"), or an instrument to add. List the parts already in the song too when the new ones change what they should play.',
          ),
        brief: z.string().trim().min(1).max(400).describe("What this musician should play, in a musician's words."),
      }),
    )
    .min(1)
    .max(8),
  tune: tuneSchema.optional(),
});

export const rehearseSchema = z.strictObject({
  notes: z.array(noteSchema).max(8).default([]).describe("Your notes to musicians, by name, for this round."),
});

export const bandToolSpecs: ToolSpec[] = [
  {
    name: BAND_ARRANGE,
    description: `Have the band play an arrangement: the tune is first placed as your plan says (copied to the parts that carry it, in their range), then each part is played by its own musician, in rehearsal order (drums, bass, harmony, then lead lines), each hearing those before it; then the band rehearses once: every musician hears the whole band, reads the notes the others sent it and fixes its own part. Missing parts are added. Returns what each played, what they said to each other and what the band sounds like now. Instruments: ${INSTRUMENT_IDS.join(", ")}.`,
    parameters: toolParameters(arrangeSchema),
  },
  {
    name: BAND_LISTEN,
    description:
      "Listen to the band as it stands: each part in a line, and what could be better (clashes with the chords, a part looping one bar, the bass missing the kick, two parts in one register, notes out of range, silence where the others play).",
    parameters: toolParameters(z.strictObject({})),
  },
  {
    name: BAND_REHEARSE,
    description: `Another rehearsal round, with your notes to musicians by name: they all hear the band, read your notes and theirs, and fix their parts. For problems that matter (at most ${MAX_REHEARSALS} rounds a turn, the one band_arrange runs included).`,
    parameters: toolParameters(rehearseSchema),
  },
];

const BAND_TOOLS = new Set([BAND_ARRANGE, BAND_LISTEN, BAND_REHEARSE]);
export const isBandTool = (name: string) => BAND_TOOLS.has(name);
