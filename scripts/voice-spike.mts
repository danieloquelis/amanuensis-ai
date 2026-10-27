// Voice spike: can Meta's models separate spoken instructions from singing in one take?
// Without arguments it builds a synthetic clip (TTS speech + a synthesized sung melody); with
// --file it uses your own recording (any format macOS can convert, e.g. a Voice Memo).
// Usage: yarn spike:voice --confirm [--file take.m4a] [--out dir]   (paid)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 24_000;
const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const out = argument("--out") ?? "/tmp/amanuensis-voice-spike";
const recording = argument("--file");
mkdirSync(out, { recursive: true });
if (!process.argv.includes("--confirm")) {
  console.log(
    "This calls the paid Meta API: one Spark 1.2 audio call (~3k tokens incl. reasoning) and one Muse Voice Transcribe call.\nRe-run with --confirm to proceed.",
  );
  process.exit(0);
}
const key = process.env.META_AI_API_KEY;
if (!key) throw new Error("Set META_AI_API_KEY in .env.local");

/** Text to 24 kHz mono 16-bit samples via macOS `say` + `afconvert`. */
function speech(text: string, name: string): Int16Array {
  const aiff = join(out, `${name}.aiff`);
  const wav = join(out, `${name}.wav`);
  execFileSync("say", ["-v", "Samantha", "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", aiff, wav]);
  return pcmFromWav(readFileSync(wav));
}

function pcmFromWav(buffer: Buffer): Int16Array {
  let offset = 12;
  while (offset < buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data")
      return new Int16Array(buffer.buffer.slice(buffer.byteOffset + offset + 8, buffer.byteOffset + offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  throw new Error("No data chunk");
}

/** A sung "ah": harmonics shaped by vowel formants, vibrato, soft attack and release. */
function sung(notes: [midi: number, beats: number][], bpm: number): Int16Array {
  const formants = [
    [730, 90, 1],
    [1090, 110, 0.5],
    [2440, 160, 0.25],
  ];
  const samples: number[] = [];
  for (const [midi, beats] of notes) {
    const f0 = 440 * 2 ** ((midi - 69) / 12);
    const length = Math.round(((beats * 60) / bpm) * RATE);
    for (let i = 0; i < length; i++) {
      const t = i / RATE;
      const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.3);
      const envelope = Math.min(1, t / 0.04) * Math.min(1, (length - i) / (0.06 * RATE));
      let value = 0;
      for (let h = 1; h * f0 < 4000; h++) {
        const freq = h * f0;
        const gain = formants.reduce(
          (sum, [center, width, level]) => sum + level * Math.exp(-(((freq - center) / width) ** 2)),
          0.02,
        );
        value += (gain / h) * Math.sin(2 * Math.PI * freq * vibrato * t);
      }
      samples.push(value * envelope * 9000 + (Math.random() - 0.5) * 120);
    }
  }
  return Int16Array.from(samples, (v) => Math.max(-32768, Math.min(32767, Math.round(v))));
}

const silence = (seconds: number) => new Int16Array(Math.round(seconds * RATE));

function wav(pcm: Int16Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer)]);
}

function syntheticTake(): Int16Array {
  const parts = [
    speech("Four four, C major, about ninety beats per minute. Start with this.", "intro"),
    silence(0.5),
    sung(
      [
        [60, 1],
        [64, 1],
        [67, 1],
        [64, 1],
        [62, 1],
        [65, 1],
        [69, 2],
      ],
      90,
    ),
    silence(0.5),
    speech("And make the last note a whole note.", "outro"),
  ];
  const pcm = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  const spans: string[] = [];
  for (const [index, part] of parts.entries()) {
    pcm.set(part, at);
    const kind = ["speech", "silence", "singing", "silence", "speech"][index];
    spans.push(`${kind} ${(at / RATE).toFixed(2)}–${((at + part.length) / RATE).toFixed(2)} s`);
    at += part.length;
  }
  console.log(`Ground truth: ${spans.join(" | ")}\nMelody: C4 E4 G4 E4 | D4 F4 A4(half) at 90 BPM`);
  return pcm;
}

/** Your recording, converted to 24 kHz mono 16-bit WAV. */
function recordedTake(path: string): Int16Array {
  const wavPath = join(out, "recording.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", path, wavPath]);
  return pcmFromWav(readFileSync(wavPath));
}

const pcm = recording ? recordedTake(recording) : syntheticTake();
const clip = wav(pcm);
writeFileSync(join(out, "take.wav"), clip);
console.log(`Clip ${(pcm.length / RATE).toFixed(1)} s → ${join(out, "take.wav")}\n`);

const PROMPT = `This recording is one take from a musician using a notation app. It may mix spoken instructions with singing or humming.
Return JSON only, no prose:
{"spans":[{"kind":"instruction"|"melody"|"silence","startSec":number,"endSec":number,"text":string|null}],
 "instructions": string,
 "melody": {"notes":[{"pitch":"C4","beats":1}],"confidence":"low"|"medium"|"high"} | null}
"text" is the transcript for instructions. For melody, give your best estimate of pitches and note lengths in beats.`;

// 1.3 is skipped: in the first spike it reasoned through its whole budget and returned nothing.
for (const model of ["muse-spark-1.2"]) {
  const started = Date.now();
  const response = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "input_audio", input_audio: { data: clip.toString("base64"), format: "wav" } },
          ],
        },
      ],
    }),
  });
  const body = await response.json();
  console.log(
    `── ${model}: HTTP ${response.status}, ${Date.now() - started} ms, usage ${JSON.stringify(body.usage ?? {})}`,
  );
  console.log(response.ok ? body.choices?.[0]?.message?.content : JSON.stringify(body).slice(0, 500));
  console.log();
}

const form = new FormData();
form.append(
  "request",
  new Blob(
    [
      JSON.stringify({
        mode: "ENDPOINTING",
        model: "muse-voice-transcribe-1.0",
        audioEncoding: "WAV",
        keywords: ["four four", "C major", "beats per minute", "whole note", "half note"],
      }),
    ],
    { type: "application/json" },
  ),
);
form.append("audio", new Blob([new Uint8Array(clip)], { type: "audio/wav" }), "take.wav");
const started = Date.now();
const asr = await fetch("https://api.meta.ai/v1/asr/transcribe", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}` },
  body: form,
});
const asrBody = await asr.json().catch(() => null);
console.log(`── muse-voice-transcribe-1.0: HTTP ${asr.status}, ${Date.now() - started} ms`);
console.log(JSON.stringify(asrBody, null, 1)?.slice(0, 1500));
