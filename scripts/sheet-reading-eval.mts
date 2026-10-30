// Phase 0 of the sheet reading plan: how well does Muse Spark read printed music from a picture?
// Each engraving fixture is drawn by the running app, sent to the model as an image, and its
// reading (key signature, meter, bar count) and score text are graded against the known score.
// Paid: pages × sizes × efforts calls of a few thousand tokens each.
// Usage: yarn eval:sheet-reading --confirm [--base http://localhost:3001] [--only leadsheet,voices]
//        [--sizes 1280,2000] [--efforts low,medium,high] [--variant plain|counting] [--zoom 2]
//        [--files ~/Desktop/a.png,~/Desktop/b.jpg]   pictures with no known score: printed for judging by eye
//        [--marks]   label every notehead with its line or space, as a detector would (perfect, from the engraver)
//        [--marks detected]   the same labels from the notehead detector (scripts/lib/notehead-detect.mts)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { layoutScore } from "@/modules/engraving";
import { meterName, parseScore, SCORE_TEXT_GUIDE } from "@/modules/score";
import { grade, pageFifths, readChords, readLines, truthChords, truthLines, type Grade } from "./lib/sheet-compare.mjs";
import { asDataUrl, closeUps, markDetected, markHeads, renderPages } from "./lib/sheet-pages.mjs";

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};
const list = (text: string) => text.split(",").filter(Boolean);
if (!process.argv.includes("--confirm")) {
  console.log("This calls the paid Meta API once per page, size and effort. Re-run with --confirm.");
  process.exit(0);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("Set META_AI_API_KEY in .env.local");
const model = process.env.META_AI_MODEL ?? "muse-spark-1.3";
const sizes = list(arg("sizes", "1280,2000")).map(Number);
const efforts = list(arg("efforts", "low,medium"));
const TIMEOUT_MS = 180_000;

const INSTRUCTIONS = `You read sheet music from a picture and write it out exactly, as a careful musician would.
First study the page: the clef of each staff, the key signature (count its sharps or flats), the time signature, how many bars there are, and every chord symbol, repeat sign and section mark. Then read each bar, note by note.
Write every note's pitch as the page shows it, as if read on that clef: do not transpose (an "8" under a treble clef still reads as a treble clef). A natural is the plain letter (E4, never En4); the only accidentals are # and b. Apply the key signature to every note (in G major an F is F#4), and an accidental holds until the barline.
Reply with one JSON object and nothing else:
{"reading": {"keyFifths": <sharps as a positive number, flats as a negative one, 0 for none>, "meter": "4/4", "bars": <number of bars>, "staves": <number of staves per system>, "unclear": ["bar 3 beat 2: the note could be E or F", ...]}, "score": "<score text: one line per bar, and per staff and voice>"}
With several staves, name each line's staff by its instrument in lowercase, first word only (trumpet, piano), and a piano's lower staff "piano.2".
Write the parts after ";" exactly as in these examples, with their keywords:
bar 1: A4q C5q F5h ; chords Fmaj7 ; section A
bar 2: E5e D5e C5q Bb4h ; chords Gm7 C7/E@3
bar 3 (6/8): C5q. rq.
The score text format:
${SCORE_TEXT_GUIDE}`;

/** Reading pitch by counting lines and spaces, as a musician learns to: the reasoning-first variant. */
const COUNTING = `
Read each note's pitch by its place on the staff, never by its shape or by guessing the melody. Count from the bottom line: on a treble staff the bottom line is E4, the first space F4, the second line G4, then A4, B4 (middle line), C5, D5, E5, F5 (top line); above it G5, then the first ledger line A5. Below: D4 in the space under the staff, C4 on the first ledger line, B3 under it. On a bass staff the bottom line is G2, then A2, B2, C3, D3 (middle line), E3, F3, G3, A3 (top line); C4 is the first ledger line above. For every note, count its line or space before you name it, then apply the key signature and accidentals.`;
const variant = arg("variant", "plain");
/** With marks, every notehead carries a red label naming its line or space (as a detector would measure it). */
const marks = process.argv.includes("--marks");
/** With `--marks detected`, the labels come from the notehead detector instead of the engraver. */
const detected = arg("marks", "") === "detected";
const MARKS = `
Small red labels beside the noteheads name the line or space each head sits on, measured by a machine: a letter and octave on that staff's clef (G4 is the second line of a treble staff). They leave out the key signature and accidentals: apply those yourself (a head labelled F5 in G major is F#5). Trust the labels for each head's line or space; a label may occasionally be missing, or sit on something that is not a note.`;
/** With detected marks, the same heads come as text too: staff by staff, with the barlines found. */
const LISTING = `The same machine lists the heads it found as text, one line per staff down the page (staves of one system come together, then the next system). Heads are named by line or space as on the labels, left to right; heads in one column (a chord) are in <…>, and | is a barline. Marks before a staff's first barline may be a clef, key or time signature rather than notes (or a pickup bar). Use the list for every note's line or space and the picture for everything else: rhythm, accidentals, rests, ties, voices and text.`;
const asked = (listing: string) => (listing ? `Read this page.\n\n${LISTING}\n${listing}` : "Read this page.");
/** With zoom N, close-ups of N bars each follow the whole page. */
const zoom = Number(arg("zoom", "0"));

type Reply = { reading?: { keyFifths?: number; meter?: string; bars?: number }; score?: string };

/** The images of one request: the whole page, then (with zoom) close-ups of a few bars each. */
type Content = ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

async function read(content: Content, effort: string) {
  const started = Date.now();
  const response = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning_effort: effort,
      messages: [
        {
          role: "system",
          content: `${INSTRUCTIONS}${variant === "counting" ? `\n${COUNTING}` : ""}${marks ? `\n${MARKS}` : ""}`,
        },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const text: string = body.choices?.[0]?.message?.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let reply: Reply = {};
  try {
    reply = JSON.parse(json);
  } catch {
    reply = {};
  }
  return {
    reply,
    raw: text,
    seconds: (Date.now() - started) / 1000,
    tokensIn: body.usage?.prompt_tokens ?? 0,
    tokensOut: body.usage?.completion_tokens ?? 0,
  };
}

const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "—");
const files = list(arg("files", "")).map((path) => path.replace(/^~(?=\/)/, homedir()));
const pages = files.length
  ? files.map((path) => ({ name: basename(path).replace(/\.\w+$/, ""), score: null, png: readFileSync(path) }))
  : await renderPages(arg("base", "http://localhost:3001"), list(arg("only", "")));
const results: Record<string, unknown>[] = [];
console.log(
  `model ${model}, prompt ${variant}; ${pages.length} pages × sizes ${sizes.join("/")} × efforts ${efforts.join("/")}\n`,
);
console.log("page        size effort | key meter bars | pitch exact rhythm chords |  secs  in/out");
for (const page of pages.filter((p) => !p.score)) {
  // A picture with no known score: print what was read, to judge by eye against the picture.
  // With `--marks detected --clefs treble,bass,…` (one per staff down the page), it is labelled first.
  const clefs = list(arg("clefs", ""));
  let listing = "";
  if (marks && detected && clefs.length) {
    const labelled = await markDetected(page.png, clefs);
    if (labelled) ({ png: page.png, listing } = labelled);
    else console.log(`${page.name}: the detector found a different number of staves than ${clefs.length}; unlabelled`);
  }
  for (const size of sizes) {
    const content: Content = [
      { type: "text", text: asked(listing) },
      { type: "image_url", image_url: { url: await asDataUrl(page.png, size) } },
    ];
    for (const effort of efforts) {
      try {
        const { reply, raw, seconds, tokensIn, tokensOut } = await read(content, effort);
        console.log(
          `\n=== ${page.name} (${size} px, ${effort}): ${seconds.toFixed(0)} s, ${tokensIn}/${tokensOut} tokens`,
        );
        console.log(JSON.stringify(reply.reading ?? "no reading", null, 1));
        console.log(reply.score ?? raw.slice(0, 2000));
        results.push({ page: page.name, size, effort, reading: reply.reading, seconds, tokensIn, tokensOut, raw });
      } catch (error) {
        console.log(`\n=== ${page.name}: failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}
for (const page of pages.filter((p) => p.score)) {
  const score = parseScore(page.score);
  let listing = "";
  const truth = { fifths: pageFifths(score), meter: meterName(score.measures[0].meter), bars: score.measures.length };
  if (marks && detected) {
    // The clefs, one per staff down the page, as the agent would read them for the detector.
    const clefs = layoutScore(score).systems.flatMap((sys) => sys.staves?.map((s) => s.clef) ?? [sys.clef]);
    const labelled = await markDetected(page.png, clefs);
    if (!labelled) console.log(`${page.name}: the detector found a different number of staves; unlabelled`);
    if (labelled) ({ png: page.png, listing } = labelled);
  } else if (marks) page.png = await markHeads(page.png, layoutScore(score));
  for (const size of sizes) {
    const content: Content = [
      { type: "text", text: asked(listing) },
      { type: "image_url", image_url: { url: await asDataUrl(page.png, size) } },
    ];
    if (zoom) {
      // The whole page gives clefs, keys and layout; the close-ups give each note's exact line or space.
      const crops = await closeUps(page.png, layoutScore(score), zoom, size);
      content[0] = {
        type: "text",
        text: `Read this page. Image 1 is the whole page; then come close-ups, in order: ${crops.map((c, k) => `image ${k + 2} shows bar${c.bars[0] === c.bars[1] ? ` ${c.bars[0]}` : `s ${c.bars[0]}–${c.bars[1]}`}`).join(", ")}. Use the whole page for clefs, key signature and time signature, and the close-ups to place every note on its exact line or space.`,
      };
      for (const crop of crops) content.push({ type: "image_url", image_url: { url: crop.url } });
    }
    for (const effort of efforts) {
      try {
        const { reply, raw, seconds, tokensIn, tokensOut } = await read(content, effort);
        const text = reply.score ?? "";
        let g: Grade | null = null;
        let parseError = "";
        try {
          const oneStaff = score.parts.length === 1 && score.parts[0].staves.length === 1;
          g = grade(truthLines(score), readLines(text, oneStaff), truthChords(score), readChords(text));
        } catch (error) {
          parseError = error instanceof Error ? error.message : String(error);
        }
        const ok = (right: boolean) => (right ? "✓" : "✗");
        const r = reply.reading ?? {};
        console.log(
          `${page.name.padEnd(11)} ${String(size).padStart(4)} ${effort.padEnd(6)} |  ${ok(r.keyFifths === truth.fifths)}    ${ok(r.meter === truth.meter)}    ${ok(r.bars === truth.bars)}  | ` +
            (g
              ? `${percent(g.pitch, g.notes).padStart(5)} ${percent(g.exact, g.notes).padStart(5)} ${percent(g.rhythmLines, g.lines).padStart(6)} ${percent(g.chordBars, g.chordTotal).padStart(6)} | `
              : `unreadable score text: ${parseError.slice(0, 60)} | `) +
            `${seconds.toFixed(0).padStart(5)}  ${tokensIn}/${tokensOut}`,
        );
        results.push({
          page: page.name,
          size,
          effort,
          truth,
          reading: reply.reading,
          grade: g,
          parseError,
          seconds,
          tokensIn,
          tokensOut,
          raw,
        });
      } catch (error) {
        console.log(
          `${page.name.padEnd(11)} ${String(size).padStart(4)} ${effort.padEnd(6)} | failed: ${error instanceof Error ? error.message : error}`,
        );
        results.push({ page: page.name, size, effort, error: String(error) });
      }
    }
  }
}
mkdirSync(".cache/sheet-reading", { recursive: true });
const file = `.cache/sheet-reading/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ model, variant, zoom, sizes, efforts, results }, null, 2));
console.log(`\nEvery reply, with the model's own words: ${file}`);
