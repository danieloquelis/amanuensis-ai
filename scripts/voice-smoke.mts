// Runs one recorded take through the real voice assistant: speech recognition (cached per take,
// so it is paid once) and the real model. Prints every tool call and, when the take has a
// truth.json, the agent score: how many meant notes the agent wrote right.
// Usage: yarn smoke:voice --confirm <take folder | audio file>   (paid: reads META_AI_API_KEY)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleVoiceRequest, type ModelPort, type VoiceResult } from "@/modules/assistant";
import { createMetaModel } from "@/modules/assistant/server";
import { createSession, executeAll } from "@/modules/score";
import { cachedRecognizer, createMuseTranscriber } from "@/modules/voice/server";
import { blankScore, compareBars, loadTakeWav, readTruth, scoreBars } from "./lib/takes.mjs";

const target = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!target || !process.argv.includes("--confirm")) {
  console.log(
    "Usage: yarn smoke:voice --confirm <take folder | audio file>\n" +
      "Paid: one speech recognition call the first time a take is used (cached after that),\n" +
      "plus the agent's model calls (usually 4–8 steps). Token use is printed at the end.",
  );
  process.exit(0);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("Set META_AI_API_KEY in .env.local");

const real = createMetaModel(apiKey, process.env.META_AI_MODEL);
let step = 0;
/** The real model, printing each decision so the agent's reasoning can be judged. */
const model: ModelPort = {
  async complete(messages, tools) {
    const reply = await real.complete(messages, tools);
    step++;
    for (const call of reply.toolCalls) console.log(`  ${step}. ${call.name} ${call.arguments.slice(0, 300)}`);
    if (!reply.toolCalls.length) console.log(`  ${step}. reply: ${reply.content}`);
    return reply;
  },
};
const recognizer = cachedRecognizer(createMuseTranscriber(apiKey), ".cache/transcripts");

const score = blankScore();
const started = Date.now();
console.log(`Take: ${target}\nAgent steps:`);
const response = await handleVoiceRequest(
  { audio: loadTakeWav(target), payload: { score, instruction: "" } },
  { model, recognizer },
);
if (response.status !== 200) {
  console.log(`Failed (${response.status}):`, response.body);
  process.exit(1);
}
const result = response.body as VoiceResult;
const written = scoreBars(executeAll(createSession(score), result.commands).score);
console.log(
  `\nHeard: ${result.heard.speech.map((t) => `"${t.text}"`).join(" ")} · sung spans ${result.heard.sung.length}`,
);
console.log(`Reply: ${result.reply}${result.question ? ` (asks: ${result.question.choices.join(" / ")})` : ""}`);
console.log(`Written:\n ${written.split(" | ").join("\n ")}`);
const truth = readTruth(target);
if (truth) {
  const { right, total } = compareBars(truth.bars, written);
  console.log(`Agent score: ${right}/${total} meant notes right`);
}
/** Muse Spark 1.2/1.3 standard prices, US$ per million tokens (dev.meta.ai pricing, Oct 2026). */
const PRICE = { input: 1.25, cachedInput: 0.15, output: 4.25 };
const { inputTokens, outputTokens, cachedInputTokens = 0 } = result.usage;
const dollars =
  ((inputTokens - cachedInputTokens) * PRICE.input +
    cachedInputTokens * PRICE.cachedInput +
    outputTokens * PRICE.output) /
  1_000_000;
console.log(
  `${((Date.now() - started) / 1000).toFixed(1)} s, ${result.steps} steps, ` +
    `${inputTokens} input (${cachedInputTokens} cached) + ${outputTokens} output tokens ≈ $${dollars.toFixed(3)}`,
);
if (!target.match(/\.\w+$/))
  writeFileSync(join(target, "smoke-result.json"), JSON.stringify({ ...result, written }, null, 2));
