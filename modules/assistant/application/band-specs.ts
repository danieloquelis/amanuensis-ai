import { z } from "zod";
import { INSTRUMENT_IDS } from "@/modules/score";
import type { ToolSpec } from "./model-port";
import { materialSchema } from "./band-material";
import { styleSchema } from "./band-styles";
import { noteSchema } from "./musician-brief";
import { tuneSchema } from "./tune-plan";
import { toolParameters } from "./tool-definitions";

/** The bandleader's tools in Band Mode: what each takes and what it does, as the model reads it. */
export const BAND_ARRANGE = "band_arrange";
export const BAND_LISTEN = "band_listen";
export const BAND_REHEARSE = "band_rehearse";
/** Rehearsal rounds a turn may have: the one after the band first plays, and one more. */
export const MAX_REHEARSALS = 2;

/** The form as the bandleader plans it: sections, and what happens in each, so the piece has an arc. */
export const formSchema = z
  .array(
    z.strictObject({
      from: z.number().int().min(1).describe("First bar of the section."),
      to: z.number().int().min(1).describe("Last bar of the section."),
      name: z.string().trim().min(1).max(40).describe('"Exposition", "Verse 1", "Chorus", "Build", "Climax", "Coda".'),
      plan: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .describe(
          "What happens here: key or harmony, who plays and who rests or enters, the texture, the dynamic (and where it is heading).",
        ),
    }),
  )
  .min(1)
  .max(12)
  .describe("The form over the whole piece, section by section: the arc from the start, through the peak, to the end.");

export const arrangeSchema = z.strictObject({
  style: styleSchema,
  feel: z.string().trim().min(1).max(300).describe("The style and feel the whole band plays in, and the passage."),
  form: formSchema,
  material: materialSchema.optional(),
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
  feel: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe("On a later turn (no band_arrange this turn): the style and feel the band plays in now."),
  style: styleSchema.optional().describe("On a later turn: the style the band plays in."),
});

export const bandToolSpecs: ToolSpec[] = [
  {
    name: BAND_ARRANGE,
    description: `Have the band play an arrangement: the tune is first placed as your plan says (copied to the parts that carry it, in their range), then every part is played by its own musician at once, each reading the style, the form and the material; then the band rehearses once: every musician hears the whole band and what a listener would mark, reads the notes the others sent it, fixes its own part and answers. Missing parts are added. Returns what each played, what they said to each other and what the band sounds like now. Instruments: ${INSTRUMENT_IDS.join(", ")}.`,
    parameters: toolParameters(arrangeSchema),
  },
  {
    name: BAND_LISTEN,
    description:
      "Listen to the band as it stands: each part in a line, and what could be better (clashes with the chords, a part looping one bar, the bass missing the kick, two parts in one register, notes out of range, a part that never plays) and, in the style's terms, its craft (parallels, scale-only lines, plodding rhythm, literal repeats, one dynamic, everyone always playing).",
    parameters: toolParameters(z.strictObject({})),
  },
  {
    name: BAND_REHEARSE,
    description: `Another rehearsal round, with your notes to musicians by name: they all hear the band, read your notes and theirs, and fix their parts. For problems that matter (at most ${MAX_REHEARSALS} rounds a turn, the one band_arrange runs included). On a later turn, without band_arrange, it is how the composer's comments reach the band already in the song: notes to the musicians they concern, who rework their own parts.`,
    parameters: toolParameters(rehearseSchema),
  },
];

const BAND_TOOLS = new Set([BAND_ARRANGE, BAND_LISTEN, BAND_REHEARSE]);
export const isBandTool = (name: string) => BAND_TOOLS.has(name);
