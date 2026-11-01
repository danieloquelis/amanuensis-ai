// The band evaluation's runs: what each one records, the results table, and grading the saved
// scores again (after a measure changes) without new model calls.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScore } from "@/modules/score";
import { BAND, measure, melodyOf, type Measures } from "./band-measures.mjs";
import type { Song } from "./band-songs.mjs";

export type Arm = "single" | "band";
export const ARMS: Arm[] = ["single", "band"];
export type Used = { calls: number; input: number; cached: number; output: number };

export type Run = {
  song: string;
  arm: Arm;
  run: number;
  /** Saved as `<file>.txt` (score text and reply) and `<file>.json` (the score). */
  file: string;
  error?: string;
  seconds: number;
  /** The chat agent's steps, and the musicians' model calls (band only). */
  steps: number;
  musicianCalls: number;
  toolCalls: number;
  toolErrors: number;
  used: Used;
  dollars: number;
  measures?: Measures;
  reply?: string;
  band?: unknown;
  tools?: string;
  /** What each refused tool call was told. */
  errors?: string[];
};

/** Measures each saved score again, against its song's melody. */
export function regrade(runs: Run[], songs: Song[], dir: string): Run[] {
  return runs.map((run) => {
    const song = songs.find((s) => s.name === run.song);
    if (run.error || !song) return run;
    const after = parseScore(JSON.parse(readFileSync(join(dir, `${run.file}.json`), "utf8")));
    return { ...run, measures: measure(after, melodyOf(song.score())) };
  });
}

/** One cell: each run's value, separated by " · ". */
const cell = (list: Run[], show: (run: Run, m: Measures) => string) =>
  list.map((run) => (run.measures ? show(run, run.measures) : "failed")).join(" · ");

/** The results, one row per song and arm, each run's value in each cell. */
export function table(runs: Run[], songs: Song[]): string {
  const lines = [
    "| Song | Arm | Parts filled | Out of range | Crowded | Bass roots | Drum bars | Melody kept | Steps + musician calls | Tool errors | Seconds | $ |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const song of songs) {
    for (const arm of ARMS) {
      const mine = runs.filter((r) => r.song === song.name && r.arm === arm);
      const columns = [
        cell(mine, (_, m) => `${m.parts}/4, ${m.filled}/${m.filledOf}`),
        cell(mine, (_, m) => `${m.outOfRange}`),
        cell(mine, (_, m) => `${m.crowded}/${m.crowdedOf}`),
        cell(mine, (_, m) => `${m.roots}/${m.rootsOf}`),
        cell(mine, (_, m) => `${m.drumBars}/${m.filledOf / BAND.length}`),
        cell(mine, (_, m) => `${m.melodyKept}/${m.melodyOf}`),
        cell(mine, (r) => `${r.steps}+${r.musicianCalls}`),
        cell(mine, (r) => `${r.toolErrors}`),
        mine.map((r) => r.seconds).join(" · "),
        mine.map((r) => r.dollars.toFixed(2)).join(" · "),
      ];
      lines.push(`| ${song.name} | ${arm} | ${columns.join(" | ")} |`);
    }
  }
  return lines.join("\n");
}
