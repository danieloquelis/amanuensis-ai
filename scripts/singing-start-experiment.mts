// Can a Meta model hear where the singing starts in a take, better than guessing where the
// recognizer's words fall? Each take with a known start is sent to Muse Spark as audio (the whole
// take, or a window around where the recognizer says the talk ends), and the model's start is
// compared with the true one: as given, and moved to the nearest onset the local pitch tracker
// hears. Times each call. Costs real API calls (a few cents in all).
//
//   yarn tsx --env-file=.env.local scripts/singing-start-experiment.mts --confirm [--repeats 2]
import { decodeWav, encodeWav, type Signal } from "@/modules/voice";
import { createSwiftF0Tracker } from "@/modules/voice/server";
import { loadTakeWav, readRawSpeech } from "./lib/takes.mjs";

if (!process.argv.includes("--confirm")) {
  console.log("This calls the real model API. Run again with --confirm.");
  process.exit(1);
}
const apiKey = process.env.META_AI_API_KEY;
if (!apiKey) throw new Error("META_AI_API_KEY is not set (run with --env-file=.env.local).");
const index = process.argv.indexOf("--repeats");
const repeats = index === -1 ? 2 : Number(process.argv[index + 1]);

/** Takes whose singing start is known: hand-marked, or read from the pitch track by hand. */
const CASES = [
  { take: "2026-10-28T00-27-48-072Z", start: 18.02, how: "hand-marked" },
  { take: "2026-10-28T00-08-36-726Z", start: 34.0, how: "hand-marked" },
  { take: "2026-11-01T17-36-23-213Z", start: 3.0, how: "pitch track" },
  { take: "2026-11-01T17-45-57-528Z", start: 11.5, how: "pitch track" },
];
const MODELS = ["muse-spark-1.2", "muse-spark-1.3"];
/** The window: this much before the end of the recognizer's last turn, and after it. */
const BEFORE_SECONDS = 6;
const AFTER_SECONDS = 3;
/** An onset: this many confident pitch frames in a row. */
const ONSET_FRAMES = 4;
const CONFIDENT = 0.8;

const PROMPT =
  "This recording is a musician talking about a song, then singing, humming or playing the melody " +
  "(sometimes on syllables like 'da' or 'ta'). Listen for where the talking stops and the music " +
  "begins. Reply with JSON only: " +
  '{"music": true or false, "start": seconds from the beginning of this clip where the music begins, ' +
  '"end": seconds where it ends}.';

const slice = (signal: Signal, from: number, to: number): Signal => ({
  ...signal,
  samples: signal.samples.slice(Math.floor(from * signal.sampleRate), Math.ceil(to * signal.sampleRate)),
});

async function askStart(model: string, clip: Signal): Promise<{ start: number | null; ms: number; raw: string }> {
  const audio = Buffer.from(encodeWav(clip)).toString("base64");
  const started = Date.now();
  const response = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "input_audio", input_audio: { data: audio, format: "wav" } },
          ],
        },
      ],
    }),
  });
  const ms = Date.now() - started;
  const body = await response.json().catch(() => null);
  const raw = String(body?.choices?.[0]?.message?.content ?? body?.error?.message ?? response.status);
  const json = /\{[\s\S]*\}/.exec(raw)?.[0];
  try {
    const parsed = json ? JSON.parse(json) : null;
    return { start: parsed?.music && Number.isFinite(parsed.start) ? Number(parsed.start) : null, ms, raw };
  } catch {
    return { start: null, ms, raw };
  }
}

/** Starts of the runs of confident pitch the local tracker hears (seconds in the take). */
async function onsets(signal: Signal): Promise<number[]> {
  const track = await createSwiftF0Tracker().track(signal);
  const found: number[] = [];
  let run = 0;
  track.confidence.forEach((confidence, i) => {
    run = confidence >= CONFIDENT ? run + 1 : 0;
    if (run === ONSET_FRAMES) found.push((i - ONSET_FRAMES + 1) * track.hop);
  });
  return found;
}

const nearest = (times: number[], to: number) =>
  times.reduce((best, t) => (Math.abs(t - to) < Math.abs(best - to) ? t : best), times[0]);
const sign = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;

const rows: string[] = [];
for (const { take, start, how } of CASES) {
  const folder = `.takes/${take}`;
  const signal = decodeWav(loadTakeWav(folder));
  const length = signal.samples.length / signal.sampleRate;
  const turns = readRawSpeech(folder);
  const talkEnds = turns.length ? turns[turns.length - 1].end : start;
  const from = Math.max(0, talkEnds - BEFORE_SECONDS);
  const clips = [
    { name: "window", offset: from, clip: slice(signal, from, Math.min(length, talkEnds + AFTER_SECONDS)) },
    { name: "whole", offset: 0, clip: signal },
  ];
  const heard = await onsets(signal);
  for (const model of MODELS) {
    for (const { name, offset, clip } of clips) {
      for (let r = 0; r < repeats; r++) {
        const answer = await askStart(model, clip);
        const at = answer.start === null ? null : answer.start + offset;
        const snapped = at === null || !heard.length ? null : nearest(heard, at);
        rows.push(
          [
            take.slice(0, 19),
            `${start} (${how})`,
            model,
            `${name} ${(clip.samples.length / clip.sampleRate).toFixed(1)}s`,
            at === null
              ? `no answer: ${answer.raw.replace(/\s+/g, " ").slice(0, 60)}`
              : `${at.toFixed(2)} (${sign(at - start)})`,
            snapped === null ? "—" : `${snapped.toFixed(2)} (${sign(snapped - start)})`,
            `${(answer.ms / 1000).toFixed(1)} s`,
          ].join(" | "),
        );
        console.log(rows.at(-1));
      }
    }
  }
}
console.log(
  "\n| Take | True start | Model | Clip | Model's start (error) | Snapped to an onset (error) | Time |\n| --- | --- | --- | --- | --- | --- | --- |",
);
for (const row of rows) console.log(`| ${row} |`);
