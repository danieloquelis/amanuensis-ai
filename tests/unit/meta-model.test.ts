import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createMetaModel } from "@/modules/assistant/server";

// The Meta adapter's request, with the network replaced by a stub that records it (nothing is sent).
const realFetch = globalThis.fetch;
let sent: Record<string, unknown>[] = [];
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  sent.push(JSON.parse(String(init.body)));
  return Response.json({
    choices: [{ message: { content: "Ok." } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}) as typeof fetch;
afterEach(() => {
  sent = [];
});
test.after(() => {
  globalThis.fetch = realFetch;
});

const ask = (model: ReturnType<typeof createMetaModel>) => model.complete([{ role: "user", content: "hi" }], []);

test("a configured reasoning effort is sent with each request", async () => {
  await ask(createMetaModel("key", "muse-spark-1.3", "low"));
  assert.equal(sent[0].reasoning_effort, "low");
});

test("without one, the model's own default effort is used", async () => {
  await ask(createMetaModel("key", "muse-spark-1.3"));
  assert.equal("reasoning_effort" in sent[0], false);
});

test("a model call that times out becomes a readable message, not a raw abort", async () => {
  globalThis.fetch = (async () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }) as typeof fetch;
  await assert.rejects(ask(createMetaModel("key")), /took longer than three minutes/);
});
