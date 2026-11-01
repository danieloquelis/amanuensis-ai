import { readPage, type PageDetection, type PageImages } from "@/modules/page";
import { SCORE_LIMITS } from "@/modules/score";
import type { Attachment } from "./attachments";
import type { ContentPart } from "./model-port";
import { setUpScore, type ScoreWriter } from "./score-setup";
import { readSourceSchema } from "./source-tool-schemas";

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** What the reading tools keep within one turn: whether the source was read, and each page's detected heads. */
export type SourceState = { read: boolean; pages: Map<number, PageDetection> };

/**
 * How notation the score cannot hold is written, matched by what the reading calls it. Triplets
 * are written as triplets (3[…]); only other tuplets, and triplets in 2/2 or compound meters, land here.
 */
const APPROXIMATIONS: [RegExp, string][] = [
  [
    /tuplet|duplet|quadruplet|quintuplet|sextuplet|septuplet/i,
    "write a triplet where it fits, else the nearest straight rhythm",
  ],
  [/triplet/i, "write the nearest straight rhythm (triplets are written only in simple meters such as 2/4, 3/4, 4/4)"],
  [/hairpin|wedge|crescendo|diminuendo/i, "leave out"],
  [/ending|volta/i, "write out in full"],
  [/lyric/i, "leave out (keep the chord symbols above them)"],
  [/key change|change of key|modulat/i, "write in the opening key"],
  [/clef change/i, "write in the staff's first clef"],
];
const OTHERWISE = "approximate or leave out";

/** How to read a page's `heads` text. */
const HEADS_KEY =
  "Page bar by page bar, each staff of its system top to bottom: every head left to right by its line or space, spelled in the key signature (add the page's accidentals yourself), a chord's heads in <…>. Write each as one note or chord, in order, adding its length (a pickup is page bar 1). Marks before a system's first barline may be its clef, key or time signature; the detector can also miss a head or take a flag or digit for one.";

const PICTURES_INTRO =
  "The pages labelled by the notehead detector (from music_read_source): each red label names the line or space of the head beside it, on its staff's clef, without key signature or accidentals.";

/**
 * The agent's reading of the attached music, checked against what the score can hold, with the
 * notehead detector run on every picture of staves it describes. The labelled pictures are
 * shown to the model after the tool results (`show`); their heads come back here as text.
 */
export async function readSource(
  raw: unknown,
  attachments: Attachment[],
  images: PageImages | null,
  state: SourceState,
  show: (parts: ContentPart[]) => void,
  writer: ScoreWriter | null = null,
): Promise<ToolResult> {
  const reading = readSourceSchema.parse(raw);
  const staves = reading.parts.reduce((sum, part) => sum + part.staves, 0);
  const fits = [
    reading.bars > SCORE_LIMITS.measures
      ? `Only bars 1–${SCORE_LIMITS.measures} fit (the source has ${reading.bars}): write whole sections up to there and say so.`
      : `All ${reading.bars} bars fit.`,
    reading.parts.length > SCORE_LIMITS.parts
      ? `Only ${SCORE_LIMITS.parts} parts fit: keep the main ones and say which you left out.`
      : `${reading.parts.length} part${reading.parts.length > 1 ? "s" : ""}, ${staves} staves.`,
  ];
  const approximations = (reading.unsupported ?? []).map((item) => {
    const rule = APPROXIMATIONS.find(([pattern]) => pattern.test(item));
    return `${item}: ${rule ? rule[1] : OTHERWISE}, and say so.`;
  });
  const pages = [];
  const pictures: ContentPart[] = [];
  for (const { attachment: number, clefs } of reading.pages ?? []) {
    const file = attachments[number - 1];
    if (!file || file.kind !== "image") {
      pages.push({ attachment: number, detected: false, note: "Not a picture: read it by eye." });
      continue;
    }
    if (!images) {
      pages.push({ attachment: number, detected: false, note: "The notehead detector is not available here." });
      continue;
    }
    const page = await readPage(images, file.bytes, clefs, { perSystem: staves, fifths: reading.keySignature });
    if (!page.ok) {
      pages.push({
        attachment: number,
        detected: false,
        note: `${page.reason} Read it by eye; say the pitches need checking.`,
      });
      continue;
    }
    state.pages.set(number, page);
    pictures.push({ type: "text", text: `[Attachment ${number}, labelled]` }, { type: "image", dataUrl: page.picture });
    pages.push({ attachment: number, detected: true, heads: page.text });
  }
  if (pictures.length) show([{ type: "text", text: PICTURES_INTRO }, ...pictures]);
  state.read = true;
  // An empty score is set up from the reading at once: no steps spent on newScore and staves.
  const setUp = writer ? setUpScore(reading, writer) : null;
  return {
    ok: true,
    fits,
    ...(approximations.length ? { approximations } : {}),
    ...(reading.pickup ? { pickup: "Write the pickup as its own first bar, rests before its notes, and say so." } : {}),
    ...(pages.length ? { pages } : {}),
    ...(pictures.length ? { heads: HEADS_KEY } : {}),
    ...(setUp ? { setUp } : {}),
    // The setup moved the score on: its revision is the one to write against.
    ...(writer ? { revision: writer.get().revision } : {}),
    next: pages.some((page) => page.detected)
      ? "Write every head of each page bar as a note on its line or space, in order, with rhythm, accidentals, rests, ties and voices from the picture. Then page_check each page and fix what it lists."
      : "Write the music.",
  };
}
