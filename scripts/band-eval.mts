// Does Band Mode (one musician agent per part, rehearsing in order under the chat's agent) write
// better band arrangements than the single agent? The same request, model and thinking run on
// three songs with Band Mode on and off, and each arranged score is measured without a model
// (scripts/lib/band-measures.mts). Each run's score is saved as score text (to read and judge)
// and as JSON (so `--regrade` can measure it again for free after a measure changes).
// Costs real API calls; stops starting runs once the spend passes --budget (US$).
//
// Band runs also record what the musicians said to each other and how many problems the band's
// listening (`listenToBand`) heard after the first pass and at the end, so the rehearsal is measured.
//
//   yarn eval:band --confirm [--repeats 2] [--parallel 2] [--budget 6] [--arms band]
//   yarn eval:band --regrade
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listenToBand, runAssistant, type AssistantRequest, type ModelPort, type Thinking } from "@/modules/assistant";
import { createMetaModels } from "@/modules/assistant/server";
import { createSession, executeAll, scoreText } from "@/modules/score";
import { measure, melodyOf } from "./lib/band-measures.mjs";
import { ARMS, regrade, table, type Arm, type Run, type Used } from "./lib/band-report.mjs";
import { SONGS, type Song } from "./lib/band-songs.mjs";

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
// Not test-results/: Playwright empties that folder whenever the browser tests start.
const OUT_DIR = join("eval-results", "band-eval");
const OUT_FILE = join("eval-results", "band-eval.json");
const THINKING: Thinking = "medium";

if (process.argv.includes("--regrade")) {
  const saved = JSON.parse(readFileSync(OUT_FILE, "utf8"));
  const runs = regrade(saved.runs, SONGS, OUT_DIR);
  writeFileSync(OUT_FILE, JSON.stringify({ ...saved, runs }, null, 2));
  console.log(table(runs, SONGS));
  process.exit(0);
}
if (!process.argv.includes("--confirm")) {
  console.log("This calls the real model API many times (see the header). Run again with --confirm.");
  process.exit(1);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("META_AI_API_KEY is not set (run with --env-file=.env.local).");
const repeats = Number(arg("repeats", "2"));
const parallel = Number(arg("parallel", "2"));
const budget = Number(arg("budget", "6"));
const arms = ARMS.filter((arm) => arg("arms", ARMS.join(",")).split(",").includes(arm));
/** Muse Spark standard prices, US$ per million tokens (as in api-compare.mts). */
const PRICE = { input: 1.25, cachedInput: 0.15, output: 4.25 };
const EMPTY: Used = { calls: 0, input: 0, cached: 0, output: 0 };

/**
 * A model that adds up what its calls used. The band's musicians are metered too: the turn's
 * `usage` counts only the chat agent's own calls.
 */
function metered(port: ModelPort) {
  const used: Used = { ...EMPTY };
  const model: ModelPort = {
    async complete(messages, tools, options) {
      const reply = await port.complete(messages, tools, options);
      used.calls++;
      used.input += reply.usage?.inputTokens ?? 0;
      used.cached += reply.usage?.cachedInputTokens ?? 0;
      used.output += reply.usage?.outputTokens ?? 0;
      return reply;
    },
  };
  return { model, used };
}

const costOf = ({ input, cached, output }: Used) =>
  ((input - cached) * PRICE.input + cached * PRICE.cachedInput + output * PRICE.output) / 1_000_000;
const total = (a: Used, b: Used): Used => ({
  calls: a.calls + b.calls,
  input: a.input + b.input,
  cached: a.cached + b.cached,
  output: a.output + b.output,
});

let spent = 0;

async function arrange(song: Song, arm: Arm, run: number): Promise<Run> {
  const file = `${song.name.replace(/ /g, "-")}-${arm}-${run}`;
  const base = { song: song.name, arm, run, file, seconds: 0, steps: 0, musicianCalls: 0, toolCalls: 0 };
  if (spent >= budget) return { ...base, toolErrors: 0, error: "skipped: over budget", used: EMPTY, dollars: 0 };
  const models = createMetaModels(apiKey!, process.env, THINKING);
  const leader = metered(models.model);
  const musicians = metered(models.musicians);
  const score = song.score();
  const request: AssistantRequest = {
    // No one answers questions here: the bandleader plans who carries the tune itself.
    instruction: `Arrange this for my band: drums, bass, piano and trumpet. ${song.style} You decide how the tune moves through the band.`,
    score,
    selectedIds: [],
    history: [],
    ...(arm === "band" ? { band: { on: true } } : {}),
  };
  const started = Date.now();
  try {
    const services = arm === "band" ? { musicians: musicians.model } : {};
    const result = await runAssistant(leader.model, request, undefined, undefined, services);
    const after = executeAll(createSession(score), result.commands).score;
    const used = total(leader.used, musicians.used);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${file}.txt`), `${scoreText(after)}\n\n--- reply ---\n${result.reply}\n`);
    writeFileSync(join(OUT_DIR, `${file}.json`), JSON.stringify(after));
    const refused = result.trace.filter((entry) => !entry.ok);
    return {
      ...base,
      seconds: Math.round((Date.now() - started) / 1000),
      steps: result.steps,
      musicianCalls: musicians.used.calls,
      toolCalls: result.trace.length,
      toolErrors: refused.length,
      used,
      dollars: costOf(used),
      measures: measure(after, melodyOf(score)),
      reply: result.reply,
      band: result.band,
      talk: result.bandNotes?.map((n) => `${n.from} → ${n.to}: ${n.note}`),
      heard: listenToBand(after).problems.length,
      ...(result.bandRounds?.length ? { heardFirst: result.bandRounds[0].problems.length } : {}),
      tools: result.trace.map((entry) => `${entry.tool}${entry.ok ? "" : "✗"}`).join(" "),
      errors: refused.map((entry) => `${entry.tool}: ${entry.error ?? "refused"}`),
    };
  } catch (error) {
    const used = total(leader.used, musicians.used);
    const seconds = Math.round((Date.now() - started) / 1000);
    return { ...base, toolErrors: 0, seconds, error: (error as Error).message, used, dollars: costOf(used) };
  } finally {
    spent += costOf(total(leader.used, musicians.used));
  }
}

/** Runs jobs a few at a time. */
async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
      process.stdout.write(".");
    }
  };
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

mkdirSync(OUT_DIR, { recursive: true });
const jobs = SONGS.flatMap((song) =>
  arms.flatMap((arm) => Array.from({ length: repeats }, (_, i) => () => arrange(song, arm, i + 1))),
);
console.log(`${jobs.length} runs (${SONGS.length} songs × ${arms.join(" and ")} × ${repeats}), ${parallel} at a time`);
const runs = await pool(jobs, parallel);
console.log(`\n\n${table(runs, SONGS)}`);
for (const run of runs.filter((r) => r.error)) console.log(`  ${run.arm} ${run.song} ${run.run}: ${run.error}`);
console.log(`\nSpent about $${spent.toFixed(2)}.`);
writeFileSync(
  OUT_FILE,
  JSON.stringify({ model: process.env.META_AI_MODEL, thinking: THINKING, repeats, runs }, null, 2),
);
console.log(`All runs: ${OUT_FILE}; score texts and scores in ${OUT_DIR}/`);
