import { join } from "node:path";
import { InferenceSession, Tensor } from "onnxruntime-node";
import type { PitchTracker } from "../application/pitch-port";
import type { PitchTrack, Signal } from "../domain/pitch-tracker";

/** SwiftF0 (MIT, github.com/lars76/swift-f0): 16 kHz audio in, a pitch every 256 samples out. */
const MODEL_PATH = join(process.cwd(), "modules/voice/infrastructure/models/swift-f0.onnx");
const SAMPLE_RATE = 16_000;
const HOP = 256;
const RANGE_HZ = { min: 46.875, max: 2093.75 };
/**
 * Long takes run in windows of 1875 frames (30 s). The model sees 11 frames back and 10 ahead,
 * so windows overlap by that much and give the same result as one pass.
 */
const WINDOW_FRAMES = 1875;
const LEFT_FRAMES = 11;
const LOOKAHEAD_FRAMES = 10;
/** Frames of digital silence get random answers; below this peak they are unvoiced. */
const SILENCE_PEAK = 1e-3;
/** The model does not normalize level: very quiet takes (below about −35 dBFS) are raised. */
const QUIET_PEAK = 0.018;
const RAISED_PEAK = 0.5;

let session: Promise<InferenceSession> | null = null;
const loadSession = () => (session ??= InferenceSession.create(MODEL_PATH));

function levelled(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0 || peak >= QUIET_PEAK) return samples;
  return samples.map((sample) => (sample / peak) * RAISED_PEAK);
}

async function run(model: InferenceSession, audio: Float32Array) {
  const result = await model.run({
    audio: new Tensor("float32", audio, [1, audio.length]),
    fmin: new Tensor("float32", [RANGE_HZ.min], []),
    fmax: new Tensor("float32", [RANGE_HZ.max], []),
  });
  return { pitch: result.pitch.data as Float32Array, confidence: result.confidence.data as Float32Array };
}

/** SwiftF0 on the server's CPU: about 180× faster than real time, so a take costs milliseconds. */
export function createSwiftF0Tracker(): PitchTracker {
  return {
    async track(signal: Signal): Promise<PitchTrack> {
      if (signal.sampleRate !== SAMPLE_RATE) throw new Error("SwiftF0 needs 16 kHz audio.");
      const model = await loadSession();
      const samples = levelled(signal.samples);
      const frames = Math.max(1, Math.floor(samples.length / HOP));
      const pitch: number[] = [];
      const confidence: number[] = [];
      for (let start = 0; start < frames; start += WINDOW_FRAMES) {
        const end = Math.min(start + WINDOW_FRAMES, frames);
        const left = Math.max(0, start - LEFT_FRAMES);
        const right = end < frames ? (end + LOOKAHEAD_FRAMES) * HOP : samples.length;
        const window = await run(model, samples.slice(left * HOP, right));
        for (let frame = start; frame < end; frame++) {
          const index = frame - left;
          const hop = samples.subarray(frame * HOP, (frame + 1) * HOP);
          const silent = hop.every((sample) => Math.abs(sample) < SILENCE_PEAK);
          pitch.push(window.pitch[index] ?? 0);
          confidence.push(silent ? 0 : (window.confidence[index] ?? 0));
        }
      }
      return { hop: HOP / SAMPLE_RATE, pitch, confidence };
    },
  };
}
