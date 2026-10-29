// Experiment: does a compact score text make the agent faster than today's JSON, and as accurate?
// Same model, same tasks, same base score. json: reads the JSON view, edits with score_edit (IDs).
// text: reads score text, writes bars with score_write. hybrid: reads score text, writes bars or
// makes typed edits that name notes by position ("2:3"). slim: hybrid with a smaller edit schema.
// Paid (small).
// Usage: yarn experiment:score-format --confirm [--runs 3]
import { readFileSync } from "node:fs";
import { scoreTools, toolParameters, type ChatMessage, type ToolSpec } from "@/modules/assistant";
import { createMetaModel } from "@/modules/assistant/server";
import {
  barEvents,
  applyCommand,
  beats,
  commandSchema,
  commandSchemaWithout,
  describeScore,
  formatChord,
  parseScore,
  resolvePositions,
  pitchName,
  SCORE_TEXT_GUIDE,
  SCORE_VOCABULARY,
  scoreText,
  writeBars,
  type Score,
} from "@/modules/score";

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 3;
const MAX_CALLS = 3;
const verbose = process.argv.includes("--verbose");
const only = process.argv.includes("--task") ? process.argv[process.argv.indexOf("--task") + 1] : null;
if (!process.argv.includes("--confirm")) {
  console.log(`Paid: 7 tasks × 4 formats × ${runs} runs, 1–3 Spark calls each (≈2–6k tokens per call).`);
  console.log("Re-run with --confirm.");
  process.exit(0);
}
const model = createMetaModel(
  process.env.META_AI_API_KEY!,
  process.env.META_AI_MODEL,
  process.env.META_AI_REASONING_EFFORT || undefined,
);
// 12 bars in C minor: a realistic mid-size lead sheet.
const base = parseScore(JSON.parse(readFileSync("tests/fixtures/engraving/long.json", "utf8")));

const bar = (score: Score, n: number) => score.measures[n - 1];
const notesOf = (score: Score, n: number) =>
  barEvents(bar(score, n)).map((e) => `${e.pitch ? pitchName(e.pitch) : "r"}/${beats(e.duration)}`);
const chordsOf = (score: Score, n: number) =>
  score.chords.filter((c) => c.measureId === bar(score, n).id).map((c) => `${formatChord(c)}@${c.beat}`);
const sameNotes = (a: Score, b: Score, n: number) => notesOf(a, n).join() === notesOf(b, n).join();

const TASKS: { name: string; instruction: string; check: (s: Score) => boolean }[] = [
  {
    name: "one chord",
    instruction: "Add an Fm chord on beat 3 of bar 2.",
    check: (s) => chordsOf(s, 2).includes("Fm@2") && sameNotes(s, base, 2),
  },
  {
    name: "rewrite a bar",
    instruction: "Rewrite bar 4 as four quarter notes walking down from G4 to D4, in the key.",
    check: (s) => notesOf(s, 4).join(" ") === "G4/1 F4/1 E♭4/1 D4/1",
  },
  {
    name: "chords everywhere",
    instruction: "Put one chord on beat 1 of every bar, cycling Cm, Fm, G7, Cm.",
    check: (s) => s.measures.every((_, i) => chordsOf(s, i + 1).join() === ["Cm@0", "Fm@0", "G7@0", "Cm@0"][i % 4]),
  },
  {
    name: "eight new bars",
    instruction:
      "Add 8 new bars after the last bar: a melody in C minor, mostly eighths and quarters, ending on C4 as a whole note.",
    check: (s) =>
      s.measures.length === 20 &&
      notesOf(s, 20).join() === "C4/4" &&
      s.measures.slice(0, 12).every((_, i) => sameNotes(s, base, i + 1)),
  },
  {
    name: "slur and tie",
    instruction: "Slur all the notes of bar 2, and make bar 3 start with A4 tied from the last note of bar 2.",
    check: (s) => {
      const two = barEvents(bar(s, 2));
      const slurred = s.slurs.some((x) => x.startEventId === two[0].id && x.endEventId === two.at(-1)!.id);
      return slurred && !!two.at(-1)!.tie && pitchName(barEvents(bar(s, 3))[0].pitch) === "A4";
    },
  },
  {
    name: "staccato",
    instruction: "Make every note in bars 1 and 3 staccato.",
    check: (s) => [1, 3].every((n) => barEvents(bar(s, n)).every((e) => !e.pitch || e.articulation === "staccato")),
  },
  {
    name: "octave up",
    instruction: "Move bars 5 and 6 up an octave.",
    check: (s) =>
      [5, 6].every((n) => notesOf(s, n).join() === notesOf(base, n).join().replaceAll("4/", "5/")) &&
      sameNotes(s, base, 7),
  },
];

const SHARED = `You edit a music score for a musician. Make the requested change with one tool call, then stop. Keep everything not mentioned unchanged. Bars are numbered from 1.`;

type Arm = {
  name: string;
  system: string;
  context: (s: Score) => string;
  tools: ToolSpec[];
  apply: (s: Score, call: { name: string; arguments: string }) => Score;
};

const POSITION_DESCRIPTIONS: Record<string, string> = {
  "ID of a note or rest (from the score context).":
    'Position of a note or rest: "bar#n" for the nth note or rest of a bar ("2#5"), or "bar:beat" ("2:3", beats from 1).',
  "ID of a bar (from the score context).": 'Bar number, e.g. "2".',
};

/** The score_edit schema with IDs replaced by musical positions, for an agent that reads score text. */
function withPositions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withPositions);
  if (!node || typeof node !== "object") return node;
  const entries = Object.entries(node)
    .filter(([key]) => key !== "pattern")
    .map(([key, value]) => [
      key,
      key === "description" ? (POSITION_DESCRIPTIONS[value as string] ?? value) : withPositions(value),
    ]);
  return Object.fromEntries(entries);
}

/** Operations the slim hybrid leaves out: whole bars are written as text, and layout is rare. */
const SLIM_PARAMETERS = withPositions(
  toolParameters(
    commandSchemaWithout([
      "replaceMeasure",
      "clearMeasure",
      "appendMeasure",
      "newScore",
      "setMeasureWidth",
      "moveAnnotation",
      "shapeSlur",
    ]),
  ),
);

const writeTool: ToolSpec = {
  name: "score_write",
  description:
    "Write whole bars in score text, one line per bar. Each listed bar becomes exactly what its line says (notes, chords, section); unlisted bars stay as they are. Bar numbers past the end add bars.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: 'Bar lines, e.g. "bar 4: G4q F4q Eb4q D4q ; chords Cm"' },
    },
    required: ["text"],
  },
};

const editTool = scoreTools.find((t) => t.name === "score_edit")!;
const ARMS: Arm[] = [
  {
    name: "json",
    system: `${SHARED}\nThe score is given as JSON (what score_get_context returns). Use IDs exactly as given.`,
    context: (s) => JSON.stringify({ revision: s.revision, score: describeScore(s), vocabulary: SCORE_VOCABULARY }),
    tools: [{ name: editTool.name, description: editTool.description, parameters: editTool.parameters }],
    apply: (s, call) => applyCommand(s, commandSchema.parse(JSON.parse(call.arguments))),
  },
  {
    name: "text",
    system: `${SHARED}\n${SCORE_TEXT_GUIDE}`,
    context: (s) => scoreText(s),
    tools: [writeTool],
    apply: (s, call) => writeBars(s, JSON.parse(call.arguments).text, "exp").score,
  },
  {
    name: "hybrid",
    system: `${SHARED}\n${SCORE_TEXT_GUIDE}\nTwo tools: score_write to write the notes of whole bars (new music, rewriting a phrase); score_edit for precise changes (a chord, tie, slur, articulation, transposition, marks, tempo), which leave the notes alone. In score_edit, name a note by its order in its bar, "bar#n" ("2#5" is the 5th note or rest of bar 2), or by "bar:beat" ("2:3"); name a bar by its number ("2").`,
    context: (s) => scoreText(s),
    tools: [
      writeTool,
      { name: editTool.name, description: editTool.description, parameters: withPositions(editTool.parameters) },
    ],
    apply: (s, call) =>
      call.name === "score_write"
        ? writeBars(s, JSON.parse(call.arguments).text, "exp").score
        : applyCommand(s, commandSchema.parse(resolvePositions(s, JSON.parse(call.arguments)))),
  },
  {
    name: "slim",
    system: `${SHARED}\n${SCORE_TEXT_GUIDE}\nTwo tools: score_write to write the notes of whole bars (new music, rewriting a phrase); score_edit for precise changes (a chord, tie, slur, articulation, transposition, marks, tempo), which leave the notes alone. In score_edit, name a note by its order in its bar, "bar#n" ("2#5" is the 5th note or rest of bar 2), or by "bar:beat" ("2:3"); name a bar by its number ("2").`,
    context: (s) => scoreText(s),
    tools: [writeTool, { name: editTool.name, description: editTool.description, parameters: SLIM_PARAMETERS }],
    apply: (s, call) =>
      call.name === "score_write"
        ? writeBars(s, JSON.parse(call.arguments).text, "exp").score
        : applyCommand(s, commandSchema.parse(resolvePositions(s, JSON.parse(call.arguments)))),
  },
];

type Result = {
  ms: number;
  cached: number;
  calls: number;
  input: number;
  output: number;
  ok: boolean;
  error?: string;
  /** The last tool call, shortened, for --verbose. */
  did?: string;
};

async function runOnce(arm: Arm, instruction: string, check: (s: Score) => boolean): Promise<Result> {
  const messages: ChatMessage[] = [
    { role: "system", content: arm.system },
    { role: "user", content: `Score:\n${arm.context(base)}\n\nRequest: ${instruction}` },
  ];
  const result: Result = { ms: 0, cached: 0, calls: 0, input: 0, output: 0, ok: false };
  const started = Date.now();
  while (result.calls < MAX_CALLS) {
    const reply = await model.complete(messages, arm.tools);
    result.calls++;
    result.input += reply.usage?.inputTokens ?? 0;
    result.output += reply.usage?.outputTokens ?? 0;
    result.cached += reply.usage?.cachedInputTokens ?? 0;
    const call = reply.toolCalls[0];
    if (!call) break;
    messages.push({ role: "assistant", content: reply.content, toolCalls: [call] });
    result.did = `${call.name} ${call.arguments.replace(/\s+/g, " ").slice(0, 240)}`;
    try {
      result.ok = check(arm.apply(base, call));
      if (!result.ok) result.error = "applied, but wrong result";
      break;
    } catch (error) {
      result.error = (error as Error).message.slice(0, 120);
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ ok: false, error: result.error }) });
    }
  }
  result.ms = Date.now() - started;
  return result;
}

const table: Record<string, Record<string, Result[]>> = {};
for (const task of TASKS.filter((t) => !only || t.name === only)) {
  table[task.name] = Object.fromEntries(ARMS.map((arm) => [arm.name, []]));
  for (let run = 0; run < runs; run++) {
    // Rotate which format goes first, so drifting API latency doesn't favour one.
    for (const arm of [...ARMS.slice(run % ARMS.length), ...ARMS.slice(0, run % ARMS.length)]) {
      const result = await runOnce(arm, task.instruction, task.check).catch((error): Result => ({
        ms: 0,
        cached: 0,
        calls: 0,
        input: 0,
        output: 0,
        ok: false,
        error: (error as Error).message,
      }));
      table[task.name][arm.name].push(result);
      if (verbose) console.log(`    ${result.did ?? "(no tool call)"}`);
      console.log(
        `${task.name} · ${arm.name} · ${result.ms} ms · ${result.calls} call(s) · in ${result.input} (cached ${result.cached}) out ${result.output} · ${result.ok ? "✓" : `✗ ${result.error ?? "no edit"}`}`,
      );
    }
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log("\nTask               | format | median ms | in tok | out tok | correct");
for (const [task, arms] of Object.entries(table)) {
  for (const [arm, results] of Object.entries(arms)) {
    const correct = results.filter((r) => r.ok).length;
    console.log(
      `${task.padEnd(18)} | ${arm.padEnd(6)} | ${String(median(results.map((r) => r.ms))).padStart(9)} | ${String(median(results.map((r) => r.input))).padStart(6)} | ${String(median(results.map((r) => r.output))).padStart(7)} | ${correct}/${results.length}`,
    );
  }
}
for (const arm of ARMS) {
  const all = Object.values(table).flatMap((arms) => arms[arm.name]);
  const total = (key: "ms" | "input" | "output") => all.reduce((sum, r) => sum + r[key], 0);
  console.log(
    `${arm.name}: total ${Math.round(total("ms") / 1000)} s, ${total("input")} in, ${total("output")} out, ${all.filter((r) => r.ok).length}/${all.length} correct`,
  );
}
