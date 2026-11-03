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

/** Chat Completions, where a test is about its wire format; Responses is the default. */
const CHAT = { api: "chat" as const };
const ask = (model: ReturnType<typeof createMetaModel>) => model.complete([{ role: "user", content: "hi" }], []);

test("a configured reasoning effort is sent with each request", async () => {
  await ask(createMetaModel("key", "muse-spark-1.3", "low", CHAT));
  assert.equal(sent[0].reasoning_effort, "low");
});

test("without one, the model's own default effort is used", async () => {
  await ask(createMetaModel("key", "muse-spark-1.3", undefined, CHAT));
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
  const reply = await createMetaModel("key", undefined, undefined, CHAT).complete(
    [{ role: "user", content: "hi" }],
    [],
    {
      onText: (text) => heard.push(text),
    },
  );
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
  await createMetaModel("key", undefined, undefined, CHAT).complete(
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

test("on the Responses API, the conversation becomes input items, the text streams while tools are offered, and reasoning goes back encrypted", async () => {
  const events = [
    { type: "response.output_text.delta", delta: "Here " },
    { type: "response.output_text.delta", delta: "it is." },
    {
      type: "response.completed",
      response: {
        output: [
          { type: "reasoning", id: "rs_2", encrypted_content: "sealed-2" },
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
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "music_read_source", arguments: "{}" }],
        reasoning: [{ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "sealed-1" }],
      },
      { role: "tool", toolCallId: "c1", content: '{"ok":true}' },
    ],
    [{ name: "page_check", description: "Check.", parameters: { type: "object" } }],
    { onText: (text) => heard.push(text), cacheKey: "turn-1" },
  );
  assert.equal(sent[0].url, "https://api.meta.ai/v1/responses");
  // Nothing is kept at Meta: the reasoning comes back encrypted, to be sent again.
  assert.equal(sent[0].store, false);
  assert.deepEqual(sent[0].include, ["reasoning.encrypted_content"]);
  assert.equal(sent[0].prompt_cache_key, "turn-1");
  assert.equal(sent[0].prompt_cache_retention, "24h");
  assert.equal(sent[0].instructions, "Be brief.");
  // A short summary of its reasoning is asked for, so the musician can see it think.
  assert.deepEqual(sent[0].reasoning, { summary: "concise", effort: "low" });
  assert.deepEqual(sent[0].input, [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Read this" },
        { type: "input_image", image_url: "data:image/png;base64,iVBOR" },
      ],
    },
    { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "sealed-1" },
    { type: "function_call", call_id: "c1", name: "music_read_source", arguments: "{}" },
    { type: "function_call_output", call_id: "c1", output: '{"ok":true}' },
  ]);
  assert.deepEqual(heard, ["Here ", "it is."]);
  assert.equal(reply.content, "Here it is.");
  assert.deepEqual(reply.toolCalls, [{ id: "c2", name: "page_check", arguments: '{"attachment":1}' }]);
  assert.deepEqual(reply.usage, { inputTokens: 90, outputTokens: 12, cachedInputTokens: 60 });
  assert.deepEqual(reply.reasoning, [{ type: "reasoning", id: "rs_2", summary: [], encrypted_content: "sealed-2" }]);
});

/** Answers each request with the next response in `replies`, counting the requests. */
function serve(...replies: (() => Response)[]) {
  let calls = 0;
  globalThis.fetch = (async () => replies[Math.min(calls++, replies.length - 1)]()) as unknown as typeof fetch;
  return () => calls;
}
const sse = (chunks: unknown[], done = true) =>
  new Response([...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`), done ? "data: [DONE]\n\n" : ""].join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
const quick = () => createMetaModel("key", undefined, undefined, { ...CHAT, retryMs: 1 });

test("a busy or failing provider is asked again; a request it refuses is not", async () => {
  const busy = () => Response.json({ error: { message: "overloaded" } }, { status: 503 });
  let calls = serve(busy, () => sse([{ choices: [{ delta: { content: "Ok." }, finish_reason: "stop" }] }]));
  assert.equal((await ask(quick())).content, "Ok.");
  assert.equal(calls(), 2);
  calls = serve(() => Response.json({ error: { message: "bad tool schema" } }, { status: 400 }));
  await assert.rejects(ask(quick()), /\(400\): bad tool schema/);
  assert.equal(calls(), 1);
  calls = serve(busy);
  await assert.rejects(ask(quick()), /\(503\)/);
  assert.equal(calls(), 3, "gives up after a few tries");
});

test("a stream cut off before its text began is asked again; once its text is shown, it fails", async () => {
  const cut = () => sse([{ choices: [{ delta: {} }] }], false);
  const calls = serve(cut, () => sse([{ choices: [{ delta: { content: "Ok." } }] }]));
  assert.equal((await ask(quick())).content, "Ok.");
  assert.equal(calls(), 2);
  serve(() => sse([{ choices: [{ delta: { content: "<score>\nbar 1:" } }] }], false));
  await assert.rejects(ask(quick()), /ended early/);
});

test("structured output goes as text.format on Responses and response_format on Chat Completions", async () => {
  const format = {
    name: "verdict",
    schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  };
  const messages = [{ role: "user" as const, content: "hi" }];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Response.json({ output: [] });
  }) as typeof fetch;
  await createMetaModel("key").complete(messages, [], { responseFormat: format });
  await createMetaModel("key", undefined, undefined, CHAT).complete(messages, [], { responseFormat: format });
  assert.deepEqual(sent[0].text, { format: { type: "json_schema", strict: true, ...format } });
  assert.equal(sent[0].response_format, undefined);
  assert.deepEqual(sent[1].response_format, { type: "json_schema", json_schema: { strict: true, ...format } });
});

test("a past tool call with empty or broken arguments goes back as {}, which Meta accepts (it refuses the request otherwise)", async () => {
  const messages = [
    { role: "user" as const, content: "write it" },
    {
      role: "assistant" as const,
      content: null,
      toolCalls: [
        { id: "a", name: "score_write", arguments: "" },
        { id: "b", name: "score_write", arguments: '{"text": "bar 1' },
        { id: "c", name: "score_write", arguments: '{"text":"bar 1: C4w"}' },
      ],
    },
  ];
  await createMetaModel("key", "muse-spark-1.3").complete(messages, []);
  await createMetaModel("key", "muse-spark-1.3", undefined, CHAT).complete(messages, []);
  const responses = (sent[0].input as { arguments?: string }[]).flatMap((item) => item.arguments ?? []);
  const chat = (sent[1].messages as { tool_calls?: { function: { arguments: string } }[] }[])
    .flatMap((message) => message.tool_calls ?? [])
    .map((call) => call.function.arguments);
  assert.deepEqual(responses, ["{}", "{}", '{"text":"bar 1: C4w"}']);
  assert.deepEqual(chat, ["{}", "{}", '{"text":"bar 1: C4w"}']);
});

// Seen in Band Mode (3 November 2026): a step that offered no tools came back as one message per
// call the model tried, ending in the call written as markup. All of it reached the musician.
test("a response's narration is not glued into the reply, and a tool call written as text is never shown", async () => {
  const said = (text: string) => ({ type: "message", content: [{ type: "output_text", text }] });
  const markup = [
    '<atem:function_calls> <atem:invoke name="assistant_plan"> <atem:parameter name="steps">',
    '[{"done": true, "text": "Poner armonía blues moderna"}] </atem:parameter> </atem:invoke> </atem:function_calls>',
  ].join("");
  const output = [
    said("Saving the settled arrangement notes."),
    { type: "reasoning", summary: [] },
    said("I'll update the song notes with the settled 8-bar blues arrangement."),
    said("Marking plan complete."),
    said(markup),
  ];
  globalThis.fetch = (async () => Response.json({ output })) as unknown as typeof fetch;
  const plan = { name: "assistant_plan", description: "Show the plan.", parameters: { type: "object" } };
  const model = createMetaModel("key", undefined, undefined, { api: "responses" });
  const offered = await model.complete([{ role: "user", content: "hi" }], [plan]);
  assert.equal(offered.content, "Marking plan complete.");
  // A tool the step offered: the call is made as the model meant it.
  assert.equal(offered.toolCalls.length, 1);
  assert.equal(offered.toolCalls[0].name, "assistant_plan");
  assert.deepEqual(JSON.parse(offered.toolCalls[0].arguments), {
    steps: [{ done: true, text: "Poner armonía blues moderna" }],
  });
  // No tools offered: the markup is dropped, and nothing is called.
  const bare = await model.complete([{ role: "user", content: "hi" }], []);
  assert.equal(bare.content, "Marking plan complete.");
  assert.deepEqual(bare.toolCalls, []);
});
