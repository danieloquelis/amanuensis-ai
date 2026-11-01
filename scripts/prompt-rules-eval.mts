// Which of the system prompt's musical rules earn their place? Each rule (a line of the prompt)
// is left out in turn, and the requests it is meant to help run with and without it against the
// real model, several times each, graded on the score that results. A rule whose removal does not
// lower the pass rate is a candidate to cut. Costs real API calls.
//
//   yarn eval:prompt-rules --confirm [--repeats 3] [--only voices,drums] [--parallel 6]
import { writeFileSync } from "node:fs";
import { runAssistant, SYSTEM_PROMPT, type AssistantResult } from "@/modules/assistant";
import { createMetaModel } from "@/modules/assistant/server";
import { createExample, createSession, executeAll, scoreText, type Score } from "@/modules/score";
import { RULES, SCENARIOS, type Scenario } from "./lib/prompt-rule-cases.mjs";

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
const model = createMetaModel(apiKey, process.env.META_AI_MODEL, process.env.META_AI_REASONING_EFFORT);
const repeats = Number(arg("repeats", "3"));
const parallel = Number(arg("parallel", "6"));
const only = arg("only", "").split(",").filter(Boolean);

/** The prompt without one rule: the line that starts with its words. Throws if the prompt changed. */
function withoutRule(start: string): string {
  const lines = SYSTEM_PROMPT.split("\n");
  const index = lines.findIndex((line) => line.startsWith(start));
  if (index === -1) throw new Error(`No prompt line starts with "${start}": update the rule list.`);
  return [...lines.slice(0, index), ...lines.slice(index + 1)].join("\n");
}

type Run = {
  scenario: string;
  rule: string;
  variant: "with" | "without";
  pass: boolean;
  note: string;
  steps: number;
  seconds: number;
  tools: string;
  /** What the run produced, kept so a grader can be fixed and the runs graded again for free. */
  reply?: string;
  text?: string;
};

async function runOnce(scenario: Scenario, variant: Run["variant"]): Promise<Run> {
  const rule = RULES[scenario.rule];
  const score: Score = scenario.score?.() ?? createExample();
  const started = Date.now();
  const base = { scenario: scenario.name, rule: scenario.rule, variant };
  try {
    const result: AssistantResult = await runAssistant(
      model,
      { instruction: scenario.instruction, score, selectedIds: [], history: [] },
      undefined,
      undefined,
      { systemPrompt: variant === "without" && rule.start ? withoutRule(rule.start) : SYSTEM_PROMPT },
    );
    const after = result.commands.length ? executeAll(createSession(score), result.commands).score : score;
    const verdict = scenario.grade({ before: score, after, text: scoreText(after), result });
    return {
      ...base,
      ...verdict,
      steps: result.steps,
      seconds: Math.round((Date.now() - started) / 1000),
      tools: result.trace.map((t) => `${t.tool}${t.ok ? "" : "✗"}`).join(" "),
      reply: result.reply,
      text: scoreText(after),
    };
  } catch (error) {
    return { ...base, pass: false, note: `failed: ${(error as Error).message}`, steps: 0, seconds: 0, tools: "" };
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

const scenarios = SCENARIOS.filter((s) => !only.length || only.includes(s.rule));
// Fail fast on a rule whose line is no longer in the prompt.
for (const scenario of scenarios) {
  const { start } = RULES[scenario.rule];
  if (start) withoutRule(start);
}
// A rule already cut from the prompt runs only as it is: a regression check.
const variantsOf = (scenario: Scenario) =>
  RULES[scenario.rule].start ? (["with", "without"] as const) : (["with"] as const);
const jobs = scenarios.flatMap((scenario) =>
  variantsOf(scenario).flatMap((variant) => Array.from({ length: repeats }, () => () => runOnce(scenario, variant))),
);
console.log(
  `${jobs.length} runs (${scenarios.length} requests, × 2 where the rule is still in the prompt, × ${repeats}), ${parallel} at a time`,
);
const runs = await pool(jobs, parallel);
console.log("\n");

const rate = (list: Run[]) => `${list.filter((r) => r.pass).length}/${list.length}`;
const mean = (list: Run[], key: "steps" | "seconds") =>
  list.length ? (list.reduce((sum, r) => sum + r[key], 0) / list.length).toFixed(1) : "—";
const lines = [
  "| Rule | Request | With rule | Without | Steps with / without | Seconds with / without |",
  "| --- | --- | --- | --- | --- | --- |",
];
for (const scenario of scenarios) {
  const mine = runs.filter((r) => r.scenario === scenario.name);
  const [withRule, without] = [mine.filter((r) => r.variant === "with"), mine.filter((r) => r.variant === "without")];
  lines.push(
    `| ${scenario.rule} | ${scenario.name} | ${rate(withRule)} | ${without.length ? rate(without) : "cut"} | ${mean(withRule, "steps")} / ${mean(without, "steps")} | ${mean(withRule, "seconds")} / ${mean(without, "seconds")} |`,
  );
}
console.log(lines.join("\n"));
console.log("\nFailures:");
for (const run of runs.filter((r) => !r.pass))
  console.log(`  ${run.variant} ${run.scenario}: ${run.note} [${run.tools}]`);
const out = arg("out", "test-results/prompt-rules-eval.json");
writeFileSync(out, JSON.stringify({ model: process.env.META_AI_MODEL, repeats, runs }, null, 2));
console.log(`\nAll runs: ${out}`);
