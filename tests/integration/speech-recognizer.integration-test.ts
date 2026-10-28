import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createMuseTranscriber } from "@/modules/voice/server";

/** A stand-in for the speech service: records each request and answers with the scripted reply. */
type Reply = { status: number; body: string };
type Received = { method: string; path: string; authorization?: string; form: FormData };

let server: Server;
let baseUrl: string;
let reply: Reply;
let received: Received[] = [];

const readForm = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const body = new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers["content-type"]! } });
  return body.formData();
};

before(async () => {
  server = createServer(async (request, response) => {
    received.push({
      method: request.method!,
      path: request.url!,
      authorization: request.headers.authorization,
      form: await readForm(request),
    });
    response.writeHead(reply.status, { "content-type": "application/json" }).end(reply.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => {
  received = [];
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const wav = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const answer = (status: number, body: unknown) => {
  reply = { status, body: typeof body === "string" ? body : JSON.stringify(body) };
};

test("sends the take as a multipart upload with the model, mode and musical hints", async () => {
  answer(200, { turns: [] });
  await createMuseTranscriber("test-key", baseUrl).transcribe(wav, ["Dsus2"]);
  assert.equal(received.length, 1);
  const [call] = received;
  assert.deepEqual([call.method, call.path, call.authorization], ["POST", "/asr/transcribe", "Bearer test-key"]);
  const settings = JSON.parse(await (call.form.get("request") as Blob).text());
  assert.deepEqual(
    [settings.model, settings.mode, settings.audioEncoding],
    ["muse-voice-transcribe-1.0", "ENDPOINTING", "WAV"],
  );
  assert.ok(settings.keywords.includes("Dsus2"));
  assert.deepEqual(new Uint8Array(await (call.form.get("audio") as Blob).arrayBuffer()), wav);
});

test("speech turns come back in seconds, and turns without words are dropped", async () => {
  answer(200, {
    transcript: "allegro over E minor",
    turns: [
      { turnId: 0, startMs: 0, endMs: 2150, transcript: " allegro over E minor " },
      { turnId: 1, startMs: 3000, endMs: 9000, transcript: "" },
    ],
  });
  const turns = await createMuseTranscriber("test-key", baseUrl).transcribe(wav);
  assert.deepEqual(turns, [{ start: 0, end: 2.15, text: "allegro over E minor" }]);
});

test("a rejected request becomes a readable error with the status", async () => {
  answer(401, { error: { message: "invalid key" } });
  await assert.rejects(createMuseTranscriber("bad-key", baseUrl).transcribe(wav), {
    message: "Speech recognition failed (401).",
  });
});

test("a service failure becomes a readable error", async () => {
  answer(503, "upstream unavailable");
  await assert.rejects(createMuseTranscriber("test-key", baseUrl).transcribe(wav), {
    message: "Speech recognition failed (503).",
  });
});

test("a malformed reply is rejected rather than read as silence", async () => {
  answer(200, { turns: [{ startMs: "soon", transcript: 42 }] });
  await assert.rejects(createMuseTranscriber("test-key", baseUrl).transcribe(wav), {
    message: "Speech recognition returned an unexpected reply.",
  });
});
