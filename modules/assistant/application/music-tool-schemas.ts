import { z } from "zod";
import { keySignatureSchema, meterSchema, TEMPO_RANGE } from "@/modules/score";

// Argument schemas of the music tools; their descriptions are the agent's documentation.

const spanId = z
  .string()
  .describe(
    "A sung span ID from the voice take, e.g. sung-1, or a voice-N stretch the musician's words say they sang.",
  );
const chordList = z.array(z.string().max(16)).max(64).describe('Chord symbols in order, e.g. ["Em", "A", "D", "G"].');

export const inferKeySchema = z.strictObject({ chords: chordList.optional(), spanId: spanId.optional() });
export const inferTempoSchema = z.strictObject({
  marking: z.string().max(60).optional().describe('A tempo word the musician used, e.g. "Allegro" or "Andante".'),
  spanIds: z.array(spanId).max(16).optional().describe("Sung spans to time together (all of the take's singing)."),
  bars: z
    .number()
    .int()
    .min(1)
    .max(64)
    .optional()
    .describe("How many bars the singing fills, when they said so or named one chord per bar. Settles double time."),
});
export const hearNotesSchema = z.strictObject({ spanId });
export const transcribeSchema = z.strictObject({
  spans: z
    .array(
      z.strictObject({
        spanId,
        bar: z
          .number()
          .int()
          .min(1)
          .max(512)
          .optional()
          .describe(
            "Score bar it starts in, when they named one or a bar is selected. Omit to continue the piece: the first span goes after the last bar with notes, later ones follow the previous span.",
          ),
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
          .describe(
            'Only when they said how many bars ("in the first bar" = 1). Default: worked out from its length at the tempo.',
          ),
        voice: z
          .string()
          .regex(/^(?:v[1-4]|[a-z][\w-]*(?:\.\d)?(?:\/v[1-4])?)$/)
          .optional()
          .describe(
            'Which line to write it into: "v2" is a second voice on the staff (a bass under the melody, guitar thumb and fingers); an instrument or staff by its handle ("trumpet", "piano.2", "piano.2/v2"). Default: the main line.',
          ),
      }),
    )
    .min(1)
    .max(16)
    .describe("Every sung span to write, in order. Give them all in one call."),
  // A model sometimes writes the number as text ("196.0"): it is still the tempo meant.
  bpm: z.coerce
    .number()
    .int()
    .min(TEMPO_RANGE.min)
    .max(TEMPO_RANGE.max)
    .optional()
    .describe(
      "The tempo they said, or music_infer_tempo's for a tempo word. Leave it out to read it from the singing (give bars). Either way the rhythm follows the singer's own drift.",
    ),
  meter: meterSchema.optional().describe("Default: the score's meter."),
  key: keySignatureSchema
    .optional()
    .describe(
      "The key the music is in: notes are read and spelled in it, at the pitch they were sung (the singer's tuning taken out). Default: the key the singing implies.",
    ),
  transpose: z
    .boolean()
    .optional()
    .describe(
      'Only when they ask for it in another key ("put it in D", "higher"): move the take into key. Never to fit the score: takes stay at the pitch sung, so they fit each other.',
    ),
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
  keep: z
    .enum(["rhythm"])
    .optional()
    .describe(
      '"rhythm" when they say the rhythm (the figures) is right but the notes are wrong: the notes already in those bars keep their lengths, ties and rests, and take the sung pitches in order. Give each span its bar (and bars). Default: the singing writes rhythm and pitches.',
    ),
  write: z.boolean().default(true).describe("Write the bars into the score (default). False only listens."),
});

export const suggestChordsSchema = z.strictObject({
  fromBar: z.number().int().min(1).optional().describe("First bar to harmonize (default 1)."),
  toBar: z.number().int().min(1).optional().describe("Last bar (default the last bar of the score)."),
  key: keySignatureSchema.optional().describe("The key to harmonize in. Default: the score's key signature."),
  chordsPerBar: z
    .union([z.literal(1), z.literal(2)])
    .default(1)
    .describe("1 = one chord per bar (lead-sheet default); 2 = a chord every half bar."),
  write: z
    .boolean()
    .default(true)
    .describe(
      "Write the chords, replacing those in these bars (default). False only lists them without changing anything.",
    ),
});
