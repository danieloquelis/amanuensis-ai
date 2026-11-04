// The voice charts in the README, from the real pipeline: a take that talks, sings and talks
// again, heard as the app hears it: Muse Voice Transcribe for the words, YIN for the
// pitch, the FFT features, and the singing model's per-frame probability and its HMM reading.
// The talk is a human reading in the public domain (LibriVox, "The Horseman", read for
// LibriVox.org; Public Domain Mark 1.0); the singing is the test suite's synthetic singer.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeSinging,
  decodeWav,
  encodeWav,
  fft,
  segmentNotes,
  singingFeatures,
  singingProbabilities,
  soundFrames,
  SINGING_MODEL,
  trackPitch,
  type Signal,
} from "@/modules/voice";
import { cachedRecognizer, createMuseTranscriber } from "@/modules/voice/server";
import { singMelody } from "../../tests/support/synthetic-voice";

const RATE = 16_000;
const WORK = join(".cache", "readme");
const READING_URL = "https://archive.org/download/spc137_1411_librivox/spc137_horseman_kgr_64kb.mp3";
/** Two spoken sentences of the reading (seconds): "I heard a horseman ride over the hill", and its title. */
const TALK = [
  [8.3, 11.6],
  [0.25, 3.3],
];
/** The example song's first two bars, sung on "ah". */
const MELODY = [60, 64, 67, 64, 62, 65, 67, 69].map((midi, i) => ({ midi, beats: i === 7 ? 2 : 1 }));
const GAP_SECONDS = 0.5;

/** The reading at 16 kHz, downloaded and converted once (macOS `afconvert`). */
function reading(): Signal {
  const wav = join(WORK, "librivox.wav");
  if (!existsSync(wav)) {
    const mp3 = join(WORK, "librivox.mp3");
    execFileSync("curl", ["-sL", "--retry", "3", "-o", mp3, READING_URL]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", mp3, wav]);
  }
  return decodeWav(new Uint8Array(readFileSync(wav)));
}

const spoken = (source: Signal, [from, to]: number[]): Signal => ({
  sampleRate: RATE,
  samples: source.samples.slice(Math.round(from * RATE), Math.round(to * RATE)),
});

function joined(parts: Signal[]): Signal {
  const gap = new Float32Array(Math.round(GAP_SECONDS * RATE));
  const pieces = parts.flatMap((part, i) => (i ? [gap, part.samples] : [part.samples]));
  const samples = new Float32Array(pieces.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const piece of pieces) {
    samples.set(piece, at);
    at += piece.length;
  }
  return { samples, sampleRate: RATE };
}

/** Log-magnitude spectrogram: 32 ms Hann windows every 10 ms, bins up to `maxHz`. */
function spectrogram(signal: Signal, maxHz: number) {
  const size = 512;
  const hop = signal.sampleRate / 100;
  const bins = Math.floor((maxHz * size) / signal.sampleRate);
  const columns: number[][] = [];
  for (let start = 0; start + size <= signal.samples.length; start += hop) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++)
      re[i] = signal.samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    fft(re, im);
    columns.push(Array.from({ length: bins }, (_, k) => 20 * Math.log10(1e-6 + Math.hypot(re[k], im[k]))));
  }
  return { columns, binHz: signal.sampleRate / size };
}

/** One frame as the app analyses it: the magnitude spectrum in dB of its 32 ms. */
function frameSpectrum(signal: Signal, time: number) {
  const size = 512;
  const centre = Math.round(time * signal.sampleRate);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++)
    re[i] = (signal.samples[centre - size / 2 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  fft(re, im);
  const binHz = signal.sampleRate / size;
  const spectrum = Array.from({ length: Math.floor(3000 / binHz) }, (_, k) => ({
    hz: k * binHz,
    db: 20 * Math.log10(1e-6 + Math.hypot(re[k], im[k])),
  }));
  return { spectrum, binHz };
}

export async function voiceData() {
  mkdirSync(WORK, { recursive: true });
  const sung = singMelody(MELODY, { bpm: 110, sampleRate: RATE, vibratoCents: 25, noise: 0.01, seed: 7 });
  const source = reading();
  const signal = joined([spoken(source, TALK[0]), sung, spoken(source, TALK[1])]);
  const recognizer = cachedRecognizer(createMuseTranscriber(process.env.META_AI_API_KEY ?? ""), WORK);
  const speech = await recognizer.transcribe(encodeWav(signal));
  const frames = trackPitch(signal);
  const sound = soundFrames(signal, frames);
  const probability = singingProbabilities(singingFeatures(frames, sound, speech), SINGING_MODEL);
  const singing = decodeSinging(probability, SINGING_MODEL);
  const sungFrames = frames.filter((_, i) => singing[i]);
  const notes = segmentNotes(sungFrames);
  // A typical frame of each: the voiced frame of median harmonicity among talk, and among singing.
  const typical = (sung: boolean) => {
    const voiced = frames.map((f, i) => i).filter((i) => frames[i].frequency !== null && singing[i] === sung);
    const sorted = [...voiced].sort((a, b) => sound[a].harmonicity - sound[b].harmonicity);
    return frames[sorted[Math.floor(sorted.length / 2)]].time;
  };
  /** A frame's spectrum and pitch. */
  const frameOf = (time: number) => ({
    time,
    hz: frames.find((f) => f.time === time)!.frequency,
    ...frameSpectrum(signal, time),
  });
  const talkFrame = typical(false);
  const sungFrame = typical(true);
  return {
    seconds: signal.samples.length / RATE,
    speech,
    frames: frames.map((f, i) => ({
      t: f.time,
      hz: f.frequency,
      flux: sound[i].flux,
      harmonicity: sound[i].harmonicity,
      rhythm: sound[i].syllableRhythm,
      p: probability[i],
      sung: singing[i],
    })),
    notes: notes.map((n) => ({ start: n.start, end: n.end, midi: n.midi })),
    spectrogram: spectrogram(signal, 4000),
    talkFrame: frameOf(talkFrame),
    sungFrame: frameOf(sungFrame),
  };
}
