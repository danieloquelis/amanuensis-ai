// How good is what Band Mode composes and arranges? Each request (scripts/lib/compose-requests.mts)
// runs through Band Mode as the app runs it; the result is measured without a model (craftOf: the
// listener's craft checks) and graded by a strict judge (scripts/lib/compose-judge.mts). Runs are
// kept under a label, so a change can be compared with the run before it.
// Costs real API calls; stops starting runs once the spend passes --budget (US$).
//
//   yarn eval:compose --confirm --label baseline [--repeats 2] [--parallel 3] [--budget 30] [--only fugue,cinematic]
//   yarn eval:compose --rejudge --label baseline     (grade the saved scores again)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { craftOf, runAssistant, type Craft, type ModelPort, type Thinking } from "@/modules/assistant";
import { createMetaModels } from "@/modules/assistant/server";
import { createSession, executeAll, parseScore, scoreText } from "@/modules/score";
import { judge, type Grade } from "./lib/compose-judge.mjs";
import { REQUESTS, type ComposeRequest } from "./lib/compose-requests.mjs";

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const label = arg("label", "run");
const DIR = join("eval-results", "compose-eval", label);
const SUMMARY = join("eval-results", "compose-eval", `${label}.json`);
const thinking = arg("thinking", "high") as Thinking;
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("META_AI_API_KEY is not set (run with --env-file=.env.local).");
/** Muse Spark standard prices, US$ per million tokens (as in band-eval.mts). */
const PRICE = { input: 1.25, cachedInput: 0.15, output: 4.25 };

type Run = {
  request: string;
  run: number;
  file: string;
  seconds: number;
  dollars: number;
  craft?: Craft;
  grade?: Grade | null;
  talk?: number;
  /** Seconds: the bandleader before band_arrange, the first pass, the rehearsals, and after the band. */
  phases?: { leader: number; firstPass: number; rehearsals: number; reply: number };
  tools?: string;
  errors?: string[];
  error?: string;
};

let spent = 0;
/** A model that adds what its calls cost to the total and to its run's own bill. */
function metered(port: ModelPort, bill: { dollars: number } = { dollars: 0 }): ModelPort {
  return {
    async complete(messages, tools, options) {
      const reply = await port.complete(messages, tools, options);
      const u = reply.usage;
      const cached = u?.cachedInputTokens ?? 0;
      const cost =
        (((u?.inputTokens ?? 0) - cached) * PRICE.input +
          cached * PRICE.cachedInput +
          (u?.outputTokens ?? 0) * PRICE.output) /
        1e6;
      spent += cost;
      bill.dollars += cost;
      return reply;
    },
  };
}
const judgeModel = () => metered(createMetaModels(apiKey!, process.env, "high").model);

async function compose(request: ComposeRequest, run: number, budget: number): Promise<Run> {
  const file = `${request.name.replace(/ /g, "-")}-${run}`;
  const base = { request: request.name, run, file, seconds: 0, dollars: 0 };
  if (spent >= budget) return { ...base, error: "skipped: over budget" };
  const bill = { dollars: 0 };
  const models = createMetaModels(apiKey!, process.env, thinking);
  const score = request.score();
  const started = Date.now();
  const marks: { arrange?: number; rehearse?: number; band?: number } = {};
  try {
    const result = await runAssistant(
      metered(models.model, bill),
      { instruction: request.instruction, score, selectedIds: [], history: [], band: { on: true } },
      undefined,
      (event) => {
        // Where the time goes: the bandleader before the band, the first pass, the rehearsals.
        const at = (Date.now() - started) / 1000;
        if (event.stage === "tool" && event.tool === "band_arrange") marks.arrange ??= at;
        if (event.stage === "musician" && event.state === "waiting" && (event.round ?? 0) > 0) marks.rehearse ??= at;
        if (event.stage === "musician" && event.state === "done") marks.band = at;
      },
      { musicians: metered(models.musicians, bill) },
    );
    // The turn's time, as the musician waits for it: the judge's grading below is not part of it.
    const turnSeconds = (Date.now() - started) / 1000;
    const after = executeAll(createSession(score), result.commands).score;
    const text = scoreText(after);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${file}.json`), JSON.stringify(after));
    const talk = (result.bandNotes ?? []).map((n) => `${n.from} → ${n.to}: ${n.note}`).join("\n");
    writeFileSync(join(DIR, `${file}.txt`), `${text}\n\n--- reply ---\n${result.reply}\n\n--- band ---\n${talk}\n`);
    const grade = await judge(judgeModel(), request.instruction, text);
    return {
      ...base,
      seconds: Math.round(turnSeconds),
      dollars: bill.dollars,
      craft: craftOf(after, { counterpoint: request.counterpoint }),
      grade,
      talk: result.bandNotes?.length ?? 0,
      phases: {
        leader: Math.round(marks.arrange ?? 0),
        firstPass: Math.round((marks.rehearse ?? marks.band ?? 0) - (marks.arrange ?? 0)),
        rehearsals: Math.round((marks.band ?? 0) - (marks.rehearse ?? marks.band ?? 0)),
        reply: Math.round(turnSeconds - (marks.band ?? 0)),
      },
      tools: result.trace.map((entry) => `${entry.tool}${entry.ok ? "" : "✗"}`).join(" "),
      errors: result.trace
        .filter((entry) => !entry.ok)
        .map((entry) => `${entry.tool}: ${entry.error ?? "refused"} ← ${entry.arguments.slice(0, 300)}`),
    };
  } catch (error) {
    return { ...base, seconds: Math.round((Date.now() - started) / 1000), error: (error as Error).message };
  }
}

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

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const f = (value: number) => (Number.isNaN(value) ? "–" : value.toFixed(1));

function table(runs: Run[]): string {
  const rows = REQUESTS.filter((r) => runs.some((run) => run.request === r.name)).map((request) => {
    const mine = runs.filter((run) => run.request === request.name && !run.error);
    const graded = mine.map((run) => run.grade).filter((g): g is Grade => Boolean(g));
    const facts = mine.map((run) => run.craft!.facts);
    return [
      request.name.padEnd(14),
      f(mean(graded.map((g) => g.overall))).padStart(7),
      graded
        .map((g) => g.level[0])
        .join("")
        .padStart(6),
      f(mean(graded.map((g) => g.development))).padStart(5),
      f(mean(graded.map((g) => g.voiceLeading))).padStart(5),
      f(mean(facts.map((x) => x.unity))).padStart(6),
      f(mean(facts.map((x) => x.parallels))).padStart(6),
      f(mean(facts.map((x) => x.scales))).padStart(6),
      f(mean(facts.map((x) => x.levels))).padStart(6),
      f(mean(mine.map((run) => run.craft!.problems.length))).padStart(6),
      f(mean(mine.map((run) => run.dollars))).padStart(6),
      f(mean(mine.map((run) => run.seconds))).padStart(6),
    ].join(" ");
  });
  const head = "request          judge  level   dev    vl  unity  paral scales levels  probs     $      s";
  return [head, ...rows].join("\n");
}

if (process.argv.includes("--rejudge")) {
  const saved: { runs: Run[] } = JSON.parse(readFileSync(SUMMARY, "utf8"));
  const runs = await pool(
    saved.runs.map((run) => async () => {
      if (run.error) return run;
      const request = REQUESTS.find((r) => r.name === run.request)!;
      const after = parseScore(JSON.parse(readFileSync(join(DIR, `${run.file}.json`), "utf8")));
      const craft = craftOf(after, { counterpoint: request.counterpoint });
      return { ...run, craft, grade: await judge(judgeModel(), request.instruction, scoreText(after)) };
    }),
    4,
  );
  writeFileSync(SUMMARY, JSON.stringify({ ...saved, runs }, null, 2));
  console.log(`\n${table(runs)}\nSpent about $${spent.toFixed(2)} judging.`);
  process.exit(0);
}
if (!process.argv.includes("--confirm")) {
  console.log("This calls the real model API many times (see the header). Run again with --confirm.");
  process.exit(1);
}
const repeats = Number(arg("repeats", "2"));
const budget = Number(arg("budget", "30"));
const only = arg("only", "");
const chosen = REQUESTS.filter((r) => !only || only.split(",").includes(r.name));
const jobs = chosen.flatMap((r) => Array.from({ length: repeats }, (_, i) => () => compose(r, i + 1, budget)));
console.log(`${jobs.length} runs (${chosen.length} requests × ${repeats}) at ${thinking} thinking, label "${label}"`);
const runs = await pool(jobs, Number(arg("parallel", "3")));
mkdirSync(join("eval-results", "compose-eval"), { recursive: true });
writeFileSync(SUMMARY, JSON.stringify({ label, thinking, model: process.env.META_AI_MODEL, runs }, null, 2));
console.log(`\n\n${table(runs)}`);
const timed = runs.filter((run) => run.phases);
const phase = (key: keyof NonNullable<Run["phases"]>) => mean(timed.map((run) => run.phases![key])).toFixed(0);
console.log(
  `\nSeconds on average: bandleader ${phase("leader")}, first pass ${phase("firstPass")}, rehearsals ${phase("rehearsals")}, reply ${phase("reply")}. Notes passed per piece: ${timed.map((run) => run.talk ?? 0).join(" ")}.`,
);
for (const run of runs.filter((r) => r.error)) console.log(`  ${run.request} ${run.run}: ${run.error}`);
console.log(`\nSpent about $${spent.toFixed(2)}. Runs: ${SUMMARY}; scores in ${DIR}/`);
