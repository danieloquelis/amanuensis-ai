// Phase 2 of the sheet reading plan: the whole agent reading a page, as in the product. Each
// engraving fixture is drawn by the running app, attached to a request on an empty score, and
// read through the assistant's tool loop (reading, detector, writing, page_check) against the real
// model. The resulting score is graded like the one-shot evaluation. Costs real API calls.
//
//   yarn eval:sheet-agent --confirm [--base http://localhost:3001] [--only leadsheet,keys]
import { mkdirSync, writeFileSync } from "node:fs";
import { readUploads, runAssistant } from "@/modules/assistant";
import { createMetaModel } from "@/modules/assistant/server";
import { createPageImages } from "@/modules/page/server";
import { applyCommand, createExample, parseScore, type Score } from "@/modules/score";
import { grade, truthChords, truthLines } from "./lib/sheet-compare.mjs";
import { renderPages } from "./lib/sheet-pages.mjs";

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const list = (text: string) => text.split(",").filter(Boolean);

if (!process.argv.includes("--confirm")) {
  console.log("This calls the real model API several times per page. Run again with --confirm.");
  process.exit(1);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("META_AI_API_KEY is not set (run with --env-file=.env.local).");
const modelName = process.env.META_AI_MODEL;
const model = createMetaModel(apiKey, modelName, process.env.META_AI_REASONING_EFFORT);
const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "—");

/** A new, empty score: what the musician has when they attach a page to a new sheet. */
function emptyScore(): Score {
  const base = createExample();
  return applyCommand(base, { requestId: "new", expectedRevision: base.revision, operation: { type: "newScore" } });
}

async function readThroughAgent(png: Buffer) {
  const read = readUploads([{ name: "page.png", mediaType: "image/png", bytes: png }]);
  if (!("attachments" in read)) throw new Error(read.error);
  let score = emptyScore();
  const request = { instruction: "", score, selectedIds: [], history: [], attachments: read.attachments };
  const started = Date.now();
  const result = await runAssistant(model, request, "eval", undefined, createPageImages());
  for (const command of result.commands) score = applyCommand(score, command);
  return { result, score, seconds: (Date.now() - started) / 1000 };
}

const pages = await renderPages(arg("base", "http://localhost:3001"), list(arg("only", "")));
console.log(`model ${modelName}; ${pages.filter((p) => p.score).length} pages through the agent\n`);
console.log("page        bars | pitch exact rhythm chords | steps checks  secs  tokens in/out (cached)");
const runs = await Promise.all(
  pages
    .filter((page) => page.score)
    .map(async (page) => {
      const truth = parseScore(page.score);
      try {
        const { result, score, seconds } = await readThroughAgent(page.png);
        const g = grade(truthLines(truth), truthLines(score), truthChords(truth), truthChords(score));
        const checks = result.trace.filter((t) => t.tool === "page_check").length;
        const { inputTokens, outputTokens, cachedInputTokens } = result.usage;
        const bars = `${score.measures.length}/${truth.measures.length}`;
        console.log(
          `${page.name.padEnd(11)} ${bars.padStart(5)} | ${percent(g.pitch, g.notes).padStart(5)} ${percent(g.exact, g.notes).padStart(5)} ${percent(g.rhythmLines, g.lines).padStart(6)} ${percent(g.chordBars, g.chordTotal).padStart(6)} | ${String(result.steps).padStart(5)} ${String(checks).padStart(6)} ${seconds.toFixed(0).padStart(5)}  ${inputTokens}/${outputTokens} (${cachedInputTokens})`,
        );
        return {
          page: page.name,
          grade: g,
          steps: result.steps,
          seconds,
          usage: result.usage,
          trace: result.trace,
          reply: result.reply,
        };
      } catch (error) {
        console.log(`${page.name.padEnd(11)} failed: ${error instanceof Error ? error.message : error}`);
        return { page: page.name, error: String(error) };
      }
    }),
);
mkdirSync(".cache/sheet-reading", { recursive: true });
const out = `.cache/sheet-reading/agent-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify(runs, null, 1));
console.log(`\nEvery run, with its trace and reply: ${out}`);
