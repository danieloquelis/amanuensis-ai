// Shared helpers for evaluating recorded takes (the local corpus in .takes/).
// A take folder holds take.wav, result.json (what the app made of it) and, once written by hand,
// truth.json: what the musician meant.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExample, describeScore, parseChordSymbol, rankKeysForChords, type Score } from "@/modules/score";
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
  return {
    ...score,
    title: "Take",
    measures: score.measures.map((m) => ({
      ...m,
      events: [{ id: `${m.id}-rest`, pitch: null, duration: { numerator: 4, denominator: 1 }, measureRest: true }],
    })),
  };
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
