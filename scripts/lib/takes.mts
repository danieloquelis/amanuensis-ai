// Shared helpers for evaluating recorded takes (the local corpus in .takes/).
// A take folder holds take.wav, result.json (what the app made of it) and, once written by hand,
// truth.json: what the musician meant.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCommand,
  createExample,
  describeScore,
  parseChordSymbol,
  rankKeysForChords,
  type Score,
} from "@/modules/score";
import { decodeWav, encodeWav, type SpeechTurn } from "@/modules/voice";

/** What the musician meant. `bars` uses the eval notation: "r/0.5 E4/0.5 … | C♯4/0.5 …". */
export type Truth = {
  key?: string;
  chords?: string;
  startBeat?: number;
  snap?: boolean;
  bpm?: number;
  bars: string;
};

/**
 * The take's audio as plain 16-bit PCM WAV bytes (the format the app records and the speech
 * service accepts); other formats are converted with macOS `afconvert`.
 */
export function loadTakeWav(path: string): Uint8Array {
  const file = statSync(path).isDirectory() ? join(path, "take.wav") : path;
  if (file.endsWith(".wav")) return encodeWav(decodeWav(new Uint8Array(readFileSync(file))));
  const wav = join(mkdtempSync(join(tmpdir(), "amanuensis-take-")), "take.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", file, wav]);
  return encodeWav(decodeWav(new Uint8Array(readFileSync(wav))));
}

export const readTruth = (folder: string): Truth | null =>
  existsSync(join(folder, "truth.json")) ? JSON.parse(readFileSync(join(folder, "truth.json"), "utf8")) : null;

/** What the speech service heard when the app processed this take, if it was kept. */
export function readHeardSpeech(folder: string): SpeechTurn[] {
  const file = join(folder, "result.json");
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")).heard?.speech ?? [];
}

/**
 * What the speech service itself wrote for this take, before the app sorted singing from talk:
 * the development cache keeps it by the recording's hash. Falls back to the kept result.
 */
export function readRawSpeech(folder: string): SpeechTurn[] {
  const wav = readFileSync(join(folder, "take.wav"));
  const key = createHash("sha256").update(wav).update("").digest("hex").slice(0, 24);
  const cached = join(".cache/transcripts", `${key}.json`);
  return existsSync(cached) ? JSON.parse(readFileSync(cached, "utf8")) : readHeardSpeech(folder);
}

/** Take folders that have a truth.json, oldest first. */
export const corpusFolders = (root: string) =>
  existsSync(root)
    ? readdirSync(root)
        .map((name) => join(root, name))
        .filter((folder) => statSync(folder).isDirectory() && existsSync(join(folder, "truth.json")))
        .sort()
    : [];

export const keyFromName = (name: string) => rankKeysForChords([parseChordSymbol(name)!])[0].key;

/** The four example bars cleared to rests: a blank page for the agent to write a take into. */
export function blankScore(): Score {
  const score = createExample();
  // Through the one mutation path, so the page has whatever shape a score has today.
  return applyCommand(score, {
    requestId: "blank",
    expectedRevision: score.revision,
    operation: {
      type: "batch",
      operations: [
        ...score.measures.map((m) => ({ type: "clearMeasure" as const, measureId: m.id })),
        { type: "rename" as const, title: "Take" },
      ],
    },
  });
}

/** The score's bars in the eval notation. */
export const scoreBars = (score: Score) =>
  describeScore(score)
    .bars.map((bar) => bar.events.map((e) => `${e.pitch === "rest" ? "r" : e.pitch}/${e.beats}`).join(" "))
    .join(" | ");

/**
 * How many meant notes were written right: same bar, same beat, same pitch (any octave, since
 * singers rarely sing in the written octave) and same length. Extra notes count against nothing
 * here but show up in the side-by-side print.
 */
export function compareBars(meant: string, written: string): { right: number; total: number } {
  const notes = (text: string) =>
    text.split(" | ").map((bar) => {
      let beat = 0;
      const found = new Map<number, string>();
      for (const token of bar.trim().split(/\s+/)) {
        const [pitch, length] = token.split("/");
        if (pitch !== "r") found.set(beat, `${pitch.replace(/\d+$/, "")}/${length}`);
        beat += Number(length);
      }
      return found;
    });
  const want = notes(meant);
  const got = notes(written);
  let right = 0;
  let total = 0;
  want.forEach((bar, i) => {
    for (const [beat, note] of bar) {
      total++;
      if (got[i]?.get(beat) === note) right++;
    }
  });
  return { right, total };
}

export const chordsByBar = (chords: string | undefined, barBeats = 4) =>
  chords?.split(" ").map((symbol, bar) => ({ beat: bar * barBeats, ...parseChordSymbol(symbol)! }));
