import { z } from "zod";

// Argument schemas of the tools for reading attached music; their descriptions are the agent's documentation.

const CLEFS = ["treble", "treble8vb", "bass", "alto", "tenor", "percussion"] as const;
const attachment = z.number().int().min(1).max(10).describe("The attachment's number, from its title.");

export const readSourceSchema = z.strictObject({
  kind: z
    .enum(["engraved", "handwritten", "chordChart", "lyricsWithChords", "noteNames", "abc", "tab", "other"])
    .describe("What the material is: printed (engraved) or handwritten notation, or music written as text."),
  title: z.string().max(120).optional(),
  composer: z.string().max(120).optional(),
  parts: z
    .array(
      z.strictObject({
        name: z.string().max(60).describe('As the page names it, e.g. "Trumpet in B♭", "Piano".'),
        instrument: z.string().max(40).describe("Our instrument it becomes: piano, trumpet, guitar, drums, …"),
        staves: z.number().int().min(1).max(2).default(1).describe("2 for a grand staff (piano)."),
        transposing: z.boolean().default(false).describe("Its page shows written pitches (B♭ trumpet, guitar)."),
      }),
    )
    .min(1)
    .max(16),
  key: z.string().max(40).optional().describe('The key, e.g. "E♭ major".'),
  keySignature: z
    .number()
    .int()
    .min(-7)
    .max(7)
    .default(0)
    .describe("The key signature: sharps positive, flats negative (E♭ major is -3). The heads are spelled in it."),
  meter: z.string().max(20).optional(),
  tempo: z.string().max(160).optional().describe('As marked, e.g. "Andante, eighth = 132".'),
  quarterBpm: z
    .number()
    .int()
    .min(1)
    .max(400)
    .optional()
    .describe(
      "The tempo in quarter notes per minute, when one is marked: eighth = 132 is 66, half = 100 (cut time) is 200.",
    ),
  pickup: z.boolean().default(false).describe("The music starts with an incomplete bar (an anacrusis)."),
  bars: z.number().int().min(1).max(999).describe("Bars in the source, a pickup counting as one."),
  sections: z.array(z.string().max(60)).max(32).optional().describe('In order, e.g. ["A bars 1–8", "B bars 9–16"].'),
  repeats: z.array(z.string().max(80)).max(16).optional().describe('e.g. "repeat bars 1–8", "D.C. al Fine".'),
  unsupported: z
    .array(z.string().max(120))
    .max(16)
    .optional()
    .describe(
      'Notation the score cannot hold (see Not yet supported), with where: "quintuplets in bar 9", "hairpins", "lyrics". Triplets in simple meters are not listed here: write them (3[…]).',
    ),
  unclear: z
    .array(z.string().max(160))
    .max(32)
    .optional()
    .describe('Spots you could not read with confidence, with your guess: "bar 5 beat 3: D4 or F4?".'),
  pages: z
    .array(
      z.strictObject({
        attachment,
        clefs: z
          .array(z.enum(CLEFS))
          .min(1)
          .max(48)
          .describe(
            "The clef of every staff down the page, system after system (a piano system is treble, bass), or just one system's when every system has the same staves: the notehead detector names each head by it.",
          ),
      }),
    )
    .max(10)
    .optional()
    .describe("For each attached picture of staff notation (not PDFs): its staves."),
});

export const pageCheckSchema = z.strictObject({
  attachment,
  staves: z
    .array(z.string().max(40))
    .min(1)
    .max(8)
    .describe(
      'The score staff each staff of one system becomes, top to bottom, by handle: ["piano", "piano.2"], or ["flute", "trumpet"]. Every system of the page repeats it.',
    ),
  firstBar: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("The score bar the page's first bar went to (a pickup written as its own bar is that bar)."),
});
