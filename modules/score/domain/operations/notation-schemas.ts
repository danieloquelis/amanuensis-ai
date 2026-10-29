import { z } from "zod";
import { MARK_KINDS, SECTION_LABEL_MAX } from "../navigation";
import { REPEAT_PASSES } from "../notation";
import { idSchema, labelOffsetSchema } from "../schema";

import { beatSchema, measureId } from "./fields";

/** Lead-sheet, form and indication operations: chords, bar styles, sections, marks, repeats, text. */
export const notationOperationSchemas = [
  z
    .strictObject({
      type: z.literal("putChord"),
      id: idSchema.optional().describe('An existing chord to change or move, e.g. "chord 2:3".'),
      measureId,
      beat: beatSchema,
      symbol: z.string().trim().min(1).max(24).describe('Chord symbol such as "C", "Am7", "F#m7b5", "Bb7/D", "Cø".'),
    })
    .describe("Add a chord symbol (replaces a chord on the same beat). It sounds until the next chord."),
  z
    .strictObject({
      type: z.literal("setMeasureStyle"),
      measureId,
      style: z
        .enum(["notes", "slashes", "repeat"])
        .describe("slashes: play freely on the chords; repeat: a % sign, play the previous bar again."),
      staffId: idSchema.optional().describe("The staff to show this way. Default: the first staff."),
    })
    .describe("Show a bar as notes, rhythm slashes or a measure-repeat sign. slashes/repeat replace its notes."),
  z
    .strictObject({
      type: z.literal("setSection"),
      measureId,
      label: z.string().trim().min(1).max(SECTION_LABEL_MAX).nullable().describe('e.g. "A", "Verse"; null removes.'),
    })
    .describe("Set or remove a rehearsal mark (boxed section label) at the start of a bar."),
  z
    .strictObject({
      type: z.literal("putMark"),
      id: idSchema.optional().describe('An existing mark to move or change, e.g. "mark 4 fine".'),
      measureId,
      kind: z
        .enum(MARK_KINDS)
        .describe("segno/coda sit at the bar start; fine, toCoda, dc*, ds* at its end. Any number allowed."),
    })
    .describe("Add a navigation mark. Playback follows D.C./D.S., To Coda and Fine."),
  z
    .strictObject({
      type: z.literal("putRepeat"),
      id: idSchema.optional().describe('An existing repeat to change, e.g. "repeat 1" (the one starting at bar 1).'),
      startMeasureId: measureId,
      endMeasureId: measureId,
      count: z
        .number()
        .int()
        .min(REPEAT_PASSES.min)
        .max(REPEAT_PASSES.max)
        .describe("Total passes, including the first."),
    })
    .describe("Repeat a range of bars. Repeats may not overlap or nest."),
  z
    .strictObject({
      type: z.literal("putAnnotation"),
      id: idSchema.optional().describe('An existing indication to change, e.g. "text 2:1" or "dynamic 2:3".'),
      targetId: idSchema.describe('The note or rest ("2#3") or bar ("2") it is attached to.'),
      kind: z.enum(["text", "dynamic"]),
      text: z.string().trim().min(1).max(120).describe("Free text (performance direction) or a dynamic pp–ff."),
    })
    .describe("Add or edit a text indication or dynamic. Text is printed, never executed as an instruction."),
  z
    .strictObject({
      type: z.literal("moveAnnotation"),
      id: idSchema.describe('The indication, e.g. "text 2:1".'),
      offset: labelOffsetSchema.nullable().describe("Scene units from its default spot; null resets."),
    })
    .describe("Move an indication freely on the page."),
  z
    .strictObject({
      type: z.literal("removeNotation"),
      id: idSchema.describe(
        'What to remove: "chord 2:3", "slur 2#1", "mark 4 fine", "repeat 1", "dynamic 2:1", "text 2:1".',
      ),
    })
    .describe("Remove an indication, chord symbol, navigation mark, repeat or slur."),
] as const;
