import { test } from "node:test";
import assert from "node:assert/strict";
import { handleVoiceRequest, type ModelPort, type VoiceResult } from "@/modules/assistant";
import { createExample } from "@/modules/score";
import { decodeWav, encodeWav, type SpeechRecognizer, type SpeechTurn } from "@/modules/voice";
import { singMelody } from "../support/synthetic-voice";

const RATE = 16_000;
const sine = (seconds: number) =>
  Float32Array.from({ length: seconds * RATE }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE));

test("a take survives encoding to 16-bit WAV and back", () => {
  const samples = sine(0.5);
  const decoded = decodeWav(encodeWav({ samples, sampleRate: RATE }));
  assert.equal(decoded.sampleRate, RATE);
  assert.equal(decoded.samples.length, samples.length);
  assert.ok(decoded.samples.every((s, i) => Math.abs(s - samples[i]) < 1e-4));
});

test("a file that is not a WAV is rejected with a readable reason", () => {
  assert.throws(() => decodeWav(new TextEncoder().encode("ID3 an mp3 header, not a wav file")), {
    message: "Not a WAV file.",
  });
});

/** A recognizer that answers with fixed turns and counts its (paid) calls. */
function fakeRecognizer(turns: SpeechTurn[] = []) {
  const calls: Uint8Array[] = [];
  const recognizer: SpeechRecognizer = {
    async transcribe(wav) {
      calls.push(wav);
      return turns;
    },
  };
  return { recognizer, calls };
}

function fakeModel() {
  const seen: string[] = [];
  const model: ModelPort = {
    async complete(messages) {
      seen.push(JSON.stringify(messages.at(-1)));
      return { content: "Wrote the tune into bars 1–2.", toolCalls: [], usage: { inputTokens: 900, outputTokens: 40 } };
    },
  };
  return { model, seen };
}

const payload = { score: createExample() };
const phrase = [60, 64, 67, 64, 62, 65, 69].map((m) => ({ midi: m, beats: 1 }));

test("talking and singing in one take reach the agent as a timeline", async () => {
  const speech = [{ start: 0, end: 0.15, text: "Allegro, in D" }];
  const { recognizer } = fakeRecognizer(speech);
  const { model, seen } = fakeModel();
  const audio = encodeWav(singMelody(phrase, { bpm: 120, sampleRate: RATE }));
  const response = await handleVoiceRequest({ audio, payload }, { model, recognizer });
  assert.equal(response.status, 200);
  const body = response.body as VoiceResult;
  assert.deepEqual(body.heard.speech, speech);
  assert.equal(body.heard.sung.length, 1);
  assert.match(seen[0], /said: \\"Allegro, in D\\"/);
  assert.deepEqual(body.usage, { inputTokens: 900, outputTokens: 40, cachedInputTokens: 0 });
});

test("a silent take is answered without calling the model", async () => {
  const { recognizer } = fakeRecognizer([]);
  const { model, seen } = fakeModel();
  const audio = encodeWav({ samples: new Float32Array(RATE), sampleRate: RATE });
  const response = await handleVoiceRequest({ audio, payload }, { model, recognizer });
  assert.equal(response.status, 200);
  assert.match((response.body as VoiceResult).reply, /didn't hear anything/);
  assert.equal(seen.length, 0);
});

test("a missing or unreadable take is rejected before the paid speech service is called", async () => {
  const { recognizer, calls } = fakeRecognizer();
  const { model } = fakeModel();
  const missing = await handleVoiceRequest({ audio: null, payload }, { model, recognizer });
  const notWav = await handleVoiceRequest({ audio: new Uint8Array(64).fill(7), payload }, { model, recognizer });
  assert.deepEqual([missing.status, notWav.status], [400, 400]);
  assert.equal(calls.length, 0);
});

test("a take over two minutes is refused before the speech service is called", async () => {
  const { recognizer, calls } = fakeRecognizer();
  const { model } = fakeModel();
  const audio = encodeWav({ samples: new Float32Array(RATE * 121), sampleRate: RATE });
  const response = await handleVoiceRequest({ audio, payload }, { model, recognizer });
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("a speech service failure becomes a readable 502", async () => {
  const recognizer: SpeechRecognizer = {
    async transcribe() {
      throw new Error("Speech recognition failed (503).");
    },
  };
  const { model } = fakeModel();
  const audio = encodeWav({ samples: sine(1), sampleRate: RATE });
  const response = await handleVoiceRequest({ audio, payload }, { model, recognizer });
  assert.deepEqual(response, { status: 502, body: { error: "Speech recognition failed (503)." } });
});
