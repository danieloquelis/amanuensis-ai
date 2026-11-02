import { z } from "zod";
import { idSchema, SCORE_LIMITS } from "../schema";
import { eventId, handleSchema, measureId } from "./fields";

/** The finest grid a copy starts on: a thirty-second note, in quarter beats. */
const SMALLEST_VALUE = 0.125;
/** How far into a bar (or past it) a copy may start, in quarter beats: a long bar's length. */
const MAX_OFFSET_BEATS = 16;
/** Staff steps a copy may move: three octaves either way. */
const TRANSPOSE_STEPS = 21;

/** A copy target past the last bar: the copied bars are all added at the end of the score. */
export const AFTER_LAST_BAR = "end";

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
      toMeasureId: measureId.describe(
        `The first bar to write them into; bars are added past the end. "${AFTER_LAST_BAR}" (or the number after the last bar) adds them all at the end.`,
      ),
      fromStaffId: handleSchema
        .optional()
        .describe('Copy only this staff\'s music ("trumpet", "piano.2"), not the whole bars.'),
      toStaffId: handleSchema
        .optional()
        .describe(
          'With fromStaffId: the staff to write it on, e.g. "piano" to give the trumpet\'s line to the piano. Default: the same staff.',
        ),
    })
    .describe(
      "Copy whole bars (every voice, meter, chord symbols, dynamics and text, slurs within them) over the bars from toMeasureId on, e.g. repeat bars 1–2 at bar 5. What those bars held is replaced; sections and marks stay. With fromStaffId, only that staff's music is copied, onto toStaffId (voice by voice, same time signature); other staves and chords stay.",
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
      offset: z
        .number()
        .min(0)
        .max(MAX_OFFSET_BEATS)
        .multipleOf(SMALLEST_VALUE)
        .optional()
        .describe("Start this many quarter beats after toEventId's start (e.g. beat 3 of a whole-bar rest: 2)."),
      steps: z
        .number()
        .int()
        .min(-TRANSPOSE_STEPS)
        .max(TRANSPOSE_STEPS)
        .optional()
        .describe(
          "Develop it: move by staff steps in the key (4 up a fifth, -3 down a fourth, 7 an octave); accidentals outside the key are kept, so a leading tone stays raised.",
        ),
      invert: z
        .boolean()
        .optional()
        .describe("Develop it: upside down, every interval mirrored around its first note."),
      retrograde: z.boolean().optional().describe("Develop it: backwards, last note first."),
      factor: z
        .union([z.literal(2), z.literal(0.5)])
        .optional()
        .describe("Develop it: 2 augments (note values doubled), 0.5 diminishes (halved)."),
    })
    .describe(
      "Copy a run of notes over the music from toEventId on, in that voice, across barlines (a note crossing one is split and tied). As it is, or developed as a composer develops a motif: moved in the key, inverted, backwards, augmented or diminished (an imitation, a fugal answer, a sequence). What was there is overwritten, and a note cut at either end of the copy leaves a rest.",
    ),
] as const;
