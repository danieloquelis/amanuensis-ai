// Does the agent do better on the Responses API, which carries its reasoning from step to step,
// than on Chat Completions, where each step reasons from scratch? The same typed requests (the
// prompt-rule cases, graded) and labelled voice takes run on both, and each reports passes, steps,
// seconds and cost. Costs real API calls. For page reads, run `yarn eval:sheet-agent` with
// META_AI_API=chat and then =responses.
//
//   yarn eval:api --confirm [--repeats 2] [--parallel 4]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleVoiceRequest, runAssistant, type AssistantResult, type VoiceResult } from "@/modules/assistant";
import { createMetaModel, type MetaApi } from "@/modules/assistant/server";
import { createExample, createSession, executeAll, scoreText } from "@/modules/score";
import { cachedRecognizer, createMuseTranscriber } from "@/modules/voice/server";
import { SCENARIOS } from "./lib/prompt-rule-cases.mjs";
import { blankScore, compareBars, corpusFolders, loadTakeWav, readTruth, scoreBars } from "./lib/takes.mjs";

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
if (!process.argv.includes("--confirm")) {
  console.log("This calls the real model API many times (see the header). Run again with --confirm.");
  process.exit(1);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("META_AI_API_KEY is not set (run with --env-file=.env.local).");
const repeats = Number(arg("repeats", "2"));
const parallel = Number(arg("parallel", "4"));
const APIS: MetaApi[] = ["chat", "responses"];
/** Muse Spark standard prices, US$ per million tokens (dev.meta.ai pricing, Oct 2026). */
const PRICE = { input: 1.25, cachedInput: 0.15, output: 4.25 };

type Run = { api: MetaApi; job: string; pass: boolean; note: string; steps: number; seconds: number; dollars: number };

const dollars = ({ usage }: AssistantResult) =>
  ((usage.inputTokens - (usage.cachedInputTokens ?? 0)) * PRICE.input +
    (usage.cachedInputTokens ?? 0) * PRICE.cachedInput +
    usage.outputTokens * PRICE.output) /
  1_000_000;

const measured = (api: MetaApi, job: string, result: AssistantResult, started: number) => ({
  api,
  job,
  steps: result.steps,
  seconds: (Date.now() - started) / 1000,
  dollars: dollars(result),
});

async function typed(api: MetaApi, index: number): Promise<Run> {
  const scenario = SCENARIOS[index];
  const model = createMetaModel(apiKey!, process.env.META_AI_MODEL, process.env.META_AI_REASONING_EFFORT, { api });
  const score = scenario.score?.() ?? createExample();
  const started = Date.now();
  const request = { instruction: scenario.instruction, score, selectedIds: [], history: [] };
  try {
    const result = await runAssistant(model, request);
    const after = result.commands.length ? executeAll(createSession(score), result.commands).score : score;
    const verdict = scenario.grade({ before: score, after, text: scoreText(after), result });
    return { ...measured(api, scenario.name, result, started), ...verdict };
  } catch (error) {
    return { api, job: scenario.name, pass: false, note: (error as Error).message, steps: 0, seconds: 0, dollars: 0 };
  }
}

/** A labelled take passes when the agent writes at least this share of the meant notes right. */
const NOTES_RIGHT = 0.8;
/** Takes with a truth.json: what the musician meant to sing. */
const takes = corpusFolders(".takes");
const recognizer = cachedRecognizer(createMuseTranscriber(apiKey), ".cache/transcripts");

async function voice(api: MetaApi, folder: string): Promise<Run> {
  const model = createMetaModel(apiKey!, process.env.META_AI_MODEL, process.env.META_AI_REASONING_EFFORT, { api });
  const score = blankScore();
  const started = Date.now();
  const job = folder.split("/").pop()!;
  const payload = { score, instruction: "" };
  const response = await handleVoiceRequest({ audio: loadTakeWav(folder), payload }, { model, recognizer });
  if (response.status !== 200) return { api, job, pass: false, note: "failed", steps: 0, seconds: 0, dollars: 0 };
  const result = response.body as VoiceResult;
  const written = scoreBars(executeAll(createSession(score), result.commands).score);
  const { right, total } = compareBars(readTruth(folder)!.bars, written);
  const note = `${right}/${total} notes right`;
  return { ...measured(api, job, result, started), pass: right >= NOTES_RIGHT * total, note };
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

const jobs = APIS.flatMap((api) =>
  Array.from({ length: repeats }, () => [
    ...SCENARIOS.map((_, index) => () => typed(api, index)),
    ...takes.map((folder) => () => voice(api, folder)),
  ]).flat(),
);
console.log(`${jobs.length} runs (${SCENARIOS.length} requests + ${takes.length} takes, × ${repeats}, × 2 APIs)`);
const runs = await pool(jobs, parallel);
console.log("\n");

const sum = (list: Run[], key: "steps" | "seconds" | "dollars") => list.reduce((total, r) => total + r[key], 0);
const mean = (list: Run[], key: "steps" | "seconds") => (list.length ? sum(list, key) / list.length : 0).toFixed(1);
const lines = ["| Job | Chat: pass, steps, s | Responses: pass, steps, s |", "| --- | --- | --- |"];
for (const job of [...new Set(runs.map((r) => r.job))]) {
  const cell = (api: MetaApi) => {
    const mine = runs.filter((r) => r.job === job && r.api === api);
    return `${mine.filter((r) => r.pass).length}/${mine.length}, ${mean(mine, "steps")}, ${mean(mine, "seconds")}`;
  };
  lines.push(`| ${job} | ${cell("chat")} | ${cell("responses")} |`);
}
for (const api of APIS) {
  const mine = runs.filter((r) => r.api === api);
  const passed = mine.filter((r) => r.pass).length;
  lines.push(
    `| **${api} total** | ${passed}/${mine.length} passed, ${mean(mine, "steps")} steps, ${mean(mine, "seconds")} s per run | $${sum(mine, "dollars").toFixed(2)} |`,
  );
}
console.log(lines.join("\n"));
console.log("\nFailures:");
for (const run of runs.filter((r) => !r.pass)) console.log(`  ${run.api} ${run.job}: ${run.note}`);
const out = arg("out", join("test-results", "api-compare.json"));
writeFileSync(out, JSON.stringify({ model: process.env.META_AI_MODEL, repeats, runs }, null, 2));
console.log(`\nAll runs: ${out}`);
