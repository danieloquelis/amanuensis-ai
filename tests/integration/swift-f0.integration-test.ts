import { test } from "node:test";
import assert from "node:assert/strict";
import type { Signal } from "@/modules/voice";
import { createSwiftF0Tracker } from "@/modules/voice/server";

// The SwiftF0 adapter against the real ONNX runtime and model file (local, no network).

const RATE = 16_000;
const tracker = createSwiftF0Tracker();

/** A voice-like tone: a fundamental with weaker harmonics, as a low male voice sings. */
const sung = (frequency: number, seconds: number, level = 0.3): Signal => {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    samples[i] = level * (Math.sin(2 * Math.PI * frequency * t) + 0.5 * Math.sin(4 * Math.PI * frequency * t)) * 0.66;
  }
  return { samples, sampleRate: RATE };
};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test("a low sung pitch is tracked to within a few cents, every 16 ms", async () => {
  const track = await tracker.track(sung(98, 1));
  const voiced = track.pitch.filter((_, i) => track.confidence[i] >= 0.5);
  assert.equal(track.hop, 0.016);
  assert.ok(voiced.length > track.pitch.length / 2, "most of the tone is voiced");
  const cents = 1200 * Math.log2(median(voiced) / 98);
  assert.ok(Math.abs(cents) < 10, `${cents.toFixed(1)} cents off`);
});

test("silence is not heard as pitch", async () => {
  const track = await tracker.track({ samples: new Float32Array(RATE), sampleRate: RATE });
  assert.ok(track.confidence.every((c) => c === 0));
});

test("a very quiet take is raised before tracking, so it is still heard", async () => {
  const track = await tracker.track(sung(220, 1, 0.005));
  assert.ok(track.confidence.filter((c) => c >= 0.5).length > track.confidence.length / 2);
});

test("a take longer than the model's 30 s window is tracked end to end", async () => {
  const track = await tracker.track(sung(147, 40));
  assert.equal(track.pitch.length, Math.floor((40 * RATE) / 256));
  const lastSecond = track.pitch.slice(-60);
  assert.ok(Math.abs(1200 * Math.log2(median(lastSecond) / 147)) < 10);
});

test("audio at another sample rate is refused rather than misread", async () => {
  await assert.rejects(tracker.track({ samples: new Float32Array(48_000), sampleRate: 48_000 }), /16 kHz/);
});
