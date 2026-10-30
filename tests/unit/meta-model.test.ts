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

test("a model that goes quiet for too long becomes a readable message, not a raw abort", async () => {
  // A connection that never answers: only the idle deadline ends it.
  globalThis.fetch = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) =>
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
    )) as typeof fetch;
  await assert.rejects(
    ask(createMetaModel("key", undefined, undefined, { idleMs: 20 })),
    /went quiet for three minutes/,
  );
});

test("a streamed answer is read piece by piece: text as it comes, tool calls from their pieces, tokens at the end", async () => {
  const chunks = [
    { choices: [{ delta: { content: "<score>\nbar 1: C4w" } }] },
    { choices: [{ delta: { content: "\n</score>" } }] },
    {
      choices: [
        { delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "page_check", arguments: '{"attach' } }] } },
      ],
    },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ment":1}' } }] } }] },
    {
      choices: [],
      usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } },
    },
  ];
  const body = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join("");
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const heard: string[] = [];
  const reply = await createMetaModel("key").complete([{ role: "user", content: "hi" }], [], {
    onText: (text) => heard.push(text),
  });
  assert.equal(sent[0].stream, true);
  assert.deepEqual(heard, ["<score>\nbar 1: C4w", "\n</score>"]);
  assert.equal(reply.content, "<score>\nbar 1: C4w\n</score>");
  assert.deepEqual(reply.toolCalls, [{ id: "c1", name: "page_check", arguments: '{"attachment":1}' }]);
  assert.deepEqual(reply.usage, { inputTokens: 120, outputTokens: 30, cachedInputTokens: 100 });
});

test("pictures and PDFs go in the user message as Meta's image_url and file parts", async () => {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Response.json({ choices: [{ message: { content: "Ok." } }] });
  }) as typeof fetch;
  const picture = "data:image/png;base64,iVBOR";
  const pdf = "data:application/pdf;base64,JVBER";
  await createMetaModel("key").complete(
    [
      {
        role: "user",
        content: [
          { type: "text", text: "Read this" },
          { type: "image", dataUrl: picture },
          { type: "file", filename: "song.pdf", dataUrl: pdf },
        ],
      },
    ],
    [],
  );
  const [message] = sent[0].messages as { content: unknown }[];
  assert.deepEqual(message.content, [
    { type: "text", text: "Read this" },
    { type: "image_url", image_url: { url: picture } },
    { type: "file", file: { filename: "song.pdf", file_data: pdf } },
  ]);
});

test("on the Responses API, the conversation becomes input items and the text streams while tools are offered", async () => {
  const events = [
    { type: "response.output_text.delta", delta: "Here " },
    { type: "response.output_text.delta", delta: "it is." },
    {
      type: "response.completed",
      response: {
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "Here it is." }] },
          { type: "function_call", call_id: "c2", name: "page_check", arguments: '{"attachment":1}' },
        ],
        usage: { input_tokens: 90, output_tokens: 12, input_tokens_details: { cached_tokens: 60 } },
      },
    },
  ];
  const stream = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, ...JSON.parse(String(init.body)) });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const heard: string[] = [];
  const reply = await createMetaModel("key", "muse-spark-1.3", "low", { api: "responses" }).complete(
    [
      { role: "system", content: "Be brief." },
      {
        role: "user",
        content: [
          { type: "text", text: "Read this" },
          { type: "image", dataUrl: "data:image/png;base64,iVBOR" },
        ],
      },
      { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "music_read_source", arguments: "{}" }] },
      { role: "tool", toolCallId: "c1", content: '{"ok":true}' },
    ],
    [{ name: "page_check", description: "Check.", parameters: { type: "object" } }],
    { onText: (text) => heard.push(text) },
  );
  assert.equal(sent[0].url, "https://api.meta.ai/v1/responses");
  assert.equal(sent[0].instructions, "Be brief.");
  assert.deepEqual(sent[0].reasoning, { effort: "low" });
  assert.deepEqual(sent[0].input, [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Read this" },
        { type: "input_image", image_url: "data:image/png;base64,iVBOR" },
      ],
    },
    { type: "function_call", call_id: "c1", name: "music_read_source", arguments: "{}" },
    { type: "function_call_output", call_id: "c1", output: '{"ok":true}' },
  ]);
  assert.deepEqual(heard, ["Here ", "it is."]);
  assert.equal(reply.content, "Here it is.");
  assert.deepEqual(reply.toolCalls, [{ id: "c2", name: "page_check", arguments: '{"attachment":1}' }]);
  assert.deepEqual(reply.usage, { inputTokens: 90, outputTokens: 12, cachedInputTokens: 60 });
});
