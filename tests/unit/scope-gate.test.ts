import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askScope,
  handleAssistantRequest,
  handleVoiceRequest,
  OUT_OF_SCOPE_REPLY,
  type ChatMessage,
  type ModelPort,
  type VoiceResult,
} from "@/modules/assistant";
import { createExample } from "@/modules/score";
import { encodeWav } from "@/modules/voice";

const RATE = 16_000;
const GATE_MARKER = "You decide whether a message";

/** The gate's structured answer, as the model sends it. */
const verdict = (choice: "IN" | "OUT") => JSON.stringify({ verdict: choice });

/**
 * A model that answers the scope gate (a call with no tools) with `gate`, or throws, and answers
 * the agent's own calls with a plain reply. `calls` records each call: whether it was the gate,
 * and what it was shown.
 */
function model(gate: string | Error) {
  const calls: { gate: boolean; messages: ChatMessage[]; format?: string }[] = [];
  const port: ModelPort = {
    async complete(messages, tools, options) {
      const isGate = tools.length === 0 && JSON.stringify(messages[0]).includes(GATE_MARKER);
      calls.push({ gate: isGate, messages: structuredClone(messages), format: options?.responseFormat?.name });
      if (!isGate) return { content: "Done.", toolCalls: [] };
      if (gate instanceof Error) throw gate;
      return { content: gate, toolCalls: [], usage: { inputTokens: 260, outputTokens: 2 } };
    },
  };
  return { port, calls };
}

const body = (instruction: string, history: { instruction: string; reply: string }[] = []) => ({
  instruction,
  score: createExample(),
  selectedIds: [],
  history,
});

test("a message about something else is declined by the gate and never reaches the agent", async () => {
  const { port, calls } = model(verdict("OUT"));
  const response = await handleAssistantRequest(body("Tell me a joke"), port);
  assert.equal(response.status, 200);
  const result = response.body as { reply: string; steps: number; commands: unknown[]; usage: object };
  assert.equal(result.reply, OUT_OF_SCOPE_REPLY);
  assert.equal(result.steps, 0);
  assert.deepEqual(result.commands, []);
  assert.deepEqual(result.usage, { inputTokens: 260, outputTokens: 2 });
  assert.deepEqual(
    calls.map((call) => call.gate),
    [true],
  );
});

test("a message that is plainly about music goes straight to the agent, with no gate call", async () => {
  const { port, calls } = model(verdict("OUT"));
  const response = await handleAssistantRequest(body("Add a bass line in bar 2"), port);
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.gate),
    [false],
  );
});

test("a short follow-up is judged with the last exchange, and runs when it is in scope", async () => {
  const { port, calls } = model(verdict("IN"));
  const history = [{ instruction: "Write a theme in D minor", reply: "Wrote 8 bars. Want it sadder?" }];
  const response = await handleAssistantRequest(body("yes please", history), port);
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.gate),
    [true, false],
  );
  const shown = JSON.stringify(calls[0].messages);
  assert.match(shown, /Write a theme in D minor/);
  assert.match(shown, /yes please/);
});

test("the gate asks for a structured verdict, reads a plain IN or OUT, and fails open otherwise", async () => {
  const declines = await handleAssistantRequest(body("hello there"), model("OUT").port);
  assert.equal((declines.body as { reply: string }).reply, OUT_OF_SCOPE_REPLY);
  const unreadable = ["IN", "I am not sure", '{"verdict":"MAYBE"}', '{"verdict":"OUT"'];
  for (const gate of [new Error("service down"), ...unreadable]) {
    const { port, calls } = model(gate);
    const response = await handleAssistantRequest(body("hello there"), port);
    assert.equal(response.status, 200);
    assert.equal((response.body as { reply: string }).reply, "Done.");
    assert.deepEqual(
      calls.map((call) => call.gate),
      [true, false],
    );
    assert.equal(calls[0].format, "scope_verdict");
  }
});

test("a take that is only talk is judged by its words; one that sings is not gated", async () => {
  const silent = encodeWav({ samples: new Float32Array(RATE), sampleRate: RATE });
  const recognizer = { transcribe: async () => [{ start: 0, end: 1, text: "tell me a joke" }] };
  const payload = { score: createExample() };
  const { port, calls } = model(verdict("OUT"));
  const response = await handleVoiceRequest({ audio: silent, payload }, { model: port, recognizer });
  assert.equal(response.status, 200);
  const result = response.body as VoiceResult;
  assert.equal(result.reply, OUT_OF_SCOPE_REPLY);
  assert.deepEqual(result.heard.speech, [{ start: 0, end: 1, text: "tell me a joke" }]);
  assert.deepEqual(
    calls.map((call) => call.gate),
    [true],
  );
});

test("a gate call that stalls is cut off and the message goes through", async () => {
  const stalled: ModelPort = {
    complete: (_messages, _tools, options) =>
      new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
  };
  const verdict = await askScope(stalled, { instruction: "tell me a joke", history: [] }, undefined, 20);
  assert.equal(verdict.outside, false);
});

test("a message about my score is gated, and one naming a bar goes straight through", async () => {
  const joke = model(verdict("OUT"));
  await handleAssistantRequest(body("tell me a joke about my score"), joke.port);
  assert.deepEqual(
    joke.calls.map((call) => call.gate),
    [true],
  );
  const edit = model(verdict("OUT"));
  await handleAssistantRequest(body("make bar 3 swing"), edit.port);
  assert.deepEqual(
    edit.calls.map((call) => call.gate),
    [false],
  );
});
