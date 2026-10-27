// Runs a few real instructions through the assistant against the Meta API.
// Usage: yarn smoke:assistant --confirm   (paid: reads META_AI_API_KEY / META_AI_MODEL from .env.local)
import { runAssistant } from "@/modules/assistant";
import { createMetaModel } from "@/modules/assistant/server";
import { createExample, describeScore, executeAll, createSession } from "@/modules/score";

if (!process.argv.includes("--confirm")) {
  console.log(
    "This calls the paid Meta API: about 6 instructions × ~3 model steps × ~5–10k input tokens.\nRe-run with --confirm to proceed.",
  );
  process.exit(0);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("Set META_AI_API_KEY in .env.local");
const model = createMetaModel(apiKey, process.env.META_AI_MODEL);

const cases = [
  { instruction: "Add an Am7 chord on beat 3 of bar 2.", selectedIds: [] },
  { instruction: "Chords for the whole tune: C, F, G7, C — one per bar.", selectedIds: [] },
  { instruction: "Make this a slash bar and mark it as section B.", selectedIds: ["bar-3"] },
  { instruction: "Add a D.C. al Fine at the end and Fine after bar 2.", selectedIds: [] },
  { instruction: "Rewrite bar 4 as four quarter notes walking down from G to D.", selectedIds: [] },
  { instruction: "Repeat that, but softer.", selectedIds: [] },
];

for (const { instruction, selectedIds } of cases) {
  const started = Date.now();
  try {
    const result = await runAssistant(model, { instruction, score: createExample(), selectedIds, history: [] });
    const replayed = executeAll(createSession(createExample()), result.commands).score;
    const bars = describeScore(replayed).bars.map((b) => ({
      bar: b.bar,
      style: b.shows,
      section: b.section,
      notes: b.events.map((e) => `${e.pitch}/${e.duration}`).join(" "),
      chords: b.chords.map((c) => `${c.symbol}@${c.beat}`).join(" "),
      marks: b.marks.map((m) => m.kind).join(" "),
    }));
    console.log(`\n▶ ${instruction}${selectedIds.length ? ` [selected ${selectedIds}]` : ""}`);
    console.log(`  reply: ${result.reply}`);
    if (result.question) console.log(`  question choices: ${result.question.choices.join(" | ")}`);
    console.log(`  steps ${result.steps}, commands ${result.commands.length}, ${Date.now() - started} ms`);
    for (const line of result.changes) console.log(`  · ${line}`);
    if (result.commands.length) console.log(JSON.stringify(bars));
  } catch (error) {
    console.log(`\n▶ ${instruction}\n  FAILED: ${(error as Error).message}`);
  }
}
