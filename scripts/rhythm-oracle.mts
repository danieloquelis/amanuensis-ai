// Local, free: how well each rhythm reader turns hand-marked onsets into written positions.
// Separates rhythm reading from onset detection. Usage: yarn eval:rhythm
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { quantizeNotes, rankTempi, readRhythm, type SungNote } from "@/modules/voice";
import { corpusFolders, readTruth } from "./lib/takes.mjs";

const BAR_BEATS = 4;

/** Where each meant note starts, in beats from the first barline. */
function meantPositions(bars: string): number[] {
  const positions: number[] = [];
  bars.split(" | ").forEach((bar, index) => {
    let beat = index * BAR_BEATS;
    for (const token of bar.trim().split(/\s+/)) {
      const [pitch, length] = token.split("/");
      if (pitch !== "r") positions.push(beat);
      beat += Number(length);
    }
  });
  return positions;
}

const asNotes = (onsets: number[]): SungNote[] =>
  onsets.map((start, i) => ({ start, end: (onsets[i + 1] ?? start + 0.4) - 0.03, midi: 60, cents: 0, clarity: 1 }));

const globalGrid = (onsets: number[], bpm: number, startBeat: number) =>
  quantizeNotes(asNotes(onsets), bpm)
    .filter((p) => p.midi !== null)
    .map((p) => p.start + startBeat);

function score(meant: number[], read: number[]) {
  const positions = meant.filter((p, i) => read[i] === p).length;
  const values = meant.slice(1).filter((p, i) => read[i + 1] - read[i] === p - meant[i]).length;
  return `${positions}/${meant.length} positions, ${values}/${meant.length - 1} note values`;
}

for (const folder of corpusFolders(".takes").filter((f) => existsSync(join(f, "onsets.json")))) {
  const truth = readTruth(folder)!;
  const onsets: number[] = JSON.parse(readFileSync(join(folder, "onsets.json"), "utf8")).onsets;
  const meant = meantPositions(truth.bars);
  const start = meant[0];
  console.log(`\n=== ${folder} (${onsets.length} onsets, ${meant.length} meant notes)`);
  const estimated = rankTempi(asNotes(onsets))[0].bpm;
  console.log(`  one tempo, estimated (${estimated} BPM):  ${score(meant, globalGrid(onsets, estimated, start))}`);
  let ceiling = { bpm: 0, right: -1, text: "" };
  for (let bpm = 60; bpm <= 160; bpm++) {
    const read = globalGrid(onsets, bpm, start);
    const right = meant.filter((p, i) => read[i] === p).length;
    if (right > ceiling.right) ceiling = { bpm, right, text: score(meant, read) };
  }
  console.log(`  one tempo, best possible (${ceiling.bpm} BPM): ${ceiling.text}`);
  for (const [label, options] of [
    ["drifting tempo, start given", { startBeat: start }],
    ["drifting tempo, start given, 80 BPM said", { startBeat: start, bpm: 80 }],
    ["drifting tempo, start found", {}],
    ["drifting tempo, start found, 4 bars said", { bars: 4 }],
  ] as const) {
    const t = performance.now();
    const reading = readRhythm(onsets, { barBeats: BAR_BEATS, ...options });
    const ms = Math.round(performance.now() - t);
    console.log(
      `  ${label}: ${score(meant, reading.positions)} (${ms} ms; tempi ${Math.min(...reading.tempi)}–${Math.max(...reading.tempi)})`,
    );
    if (process.argv.includes("--verbose"))
      console.log(`    read  ${reading.positions.join(" ")}\n    meant ${meant.join(" ")}`);
  }
}
