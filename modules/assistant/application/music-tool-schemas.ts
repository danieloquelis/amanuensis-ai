import { z } from "zod";
import { keySignatureSchema, meterSchema, TEMPO_RANGE } from "@/modules/score";

// Argument schemas of the music tools; their descriptions are the agent's documentation.

const spanId = z.string().describe("A sung span ID from the voice take, e.g. sung-1.");
const chordList = z.array(z.string().max(16)).max(64).describe('Chord symbols in order, e.g. ["Em", "A", "D", "G"].');

export const inferKeySchema = z.strictObject({ chords: chordList.optional(), spanId: spanId.optional() });
export const inferTempoSchema = z.strictObject({
  marking: z.string().max(60).optional().describe('A tempo word the musician used, e.g. "Allegro" or "Andante".'),
  spanIds: z.array(spanId).max(16).optional().describe("Sung spans to time together (all of the take's singing)."),
});
export const transcribeSchema = z.strictObject({
  spans: z
    .array(
      z.strictObject({
        spanId,
        bar: z.number().int().min(1).max(512).describe("Score bar this span starts in, from their words or in order."),
        startBeat: z
          .number()
          .min(0)
          .optional()
          .describe("Where its first note falls in that bar (0.5 = after an eighth rest). Inferred if omitted."),
        bars: z
          .number()
          .int()
          .min(1)
          .max(64)
          .optional()
          .describe('How many bars it fills ("in the first bar" = 1). Default: up to the next span\'s bar.'),
      }),
    )
    .min(1)
    .max(16)
    .describe("Every sung span to write, each with its bar. Give them all in one call."),
  bpm: z.number().int().min(TEMPO_RANGE.min).max(TEMPO_RANGE.max),
  meter: meterSchema.optional().describe("Default: the score's meter."),
  key: keySignatureSchema
    .optional()
    .describe("The key to write in. The take is transposed into it: singers rarely start on the written pitch."),
  chords: z
    .array(
      z.strictObject({
        bar: z.number().int().min(1).describe("Score bar, from 1."),
        beat: z.number().min(0).describe("Quarter beats into the bar, from 0."),
        symbol: z.string(),
      }),
    )
    .max(64)
    .optional()
    .describe("Chords under the singing. They place the take in the key; doubtful notes lean to chord tones."),
  snapToChordTones: z
    .boolean()
    .optional()
    .describe("The tune is built from chord tones (arpeggio, riff, guitar figure): notes near a chord tone become it."),
  write: z.boolean().default(true).describe("Write the bars into the score (default). False only listens."),
});
