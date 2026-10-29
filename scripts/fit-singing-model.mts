// Fits the singing model (modules/voice/domain/singing-model.ts) on mixed takes built from real
// recordings, whose every moment's truth is known (scripts/lib/singing-mixes.mts), and on real
// takes, and reports how precisely it finds where talk ends and singing starts.
// Usage: yarn fit:singing             fit, report, and write the model
//        yarn fit:singing --check     report on the model in the code, without fitting
//        yarn fit:singing --fixture   also write the FIXTURE takes' sound for the unit tests
// The mixes are heard by the speech service as the app hears a take (cached in .cache/transcripts).
import { mkdirSync, writeFileSync } from "node:fs";
import { sungStretches, SINGING_MODEL, type SingingModel } from "@/modules/voice";
import { describeScore, within, type BoundaryScore } from "./lib/boundary-score.mjs";
import {
  fitEvidence,
  hearMix,
  hearTake,
  labeledByWords,
  scoreMixes,
  type Heard,
  type HeardMix,
} from "./lib/singing-fit.mjs";
import { ALL_SPOKEN, ALL_SUNG, FIXTURE, TALK_THEN_SINGING } from "./lib/singing-labels.mjs";
import { buildMixes, loadPieces } from "./lib/singing-mixes.mjs";

const MIXES_PER_HALF = 20;
const MODEL_FILE = "modules/voice/domain/singing-model.ts";
const FIXTURE_FILE = "tests/fixtures/voice/singing-takes.json";
const EVIDENCE_WEIGHTS = [0.05, 0.1, 0.2, 0.3, 0.5];
const SWITCH_CHANCES = [1e-4, 3e-4, 1e-3, 3e-3, 1e-2];
/** Talk read as singing is sent to be written as notes: it costs this many misses. */
const FALSE_ALARM_COST = 3;

const real = new Map<string, Heard>();
for (const prefix of [...ALL_SUNG, ...TALK_THEN_SINGING, ...ALL_SPOKEN]) real.set(prefix, await hearTake(prefix));
const wordLabeled = TALK_THEN_SINGING.map((prefix) => labeledByWords(real.get(prefix)!));
const pieces = loadPieces();
const halves: HeardMix[][] = [];
for (const k of [0, 1]) {
  const half = { talk: pieces.talk.filter((_, i) => i % 2 === k), sung: pieces.sung.filter((_, i) => i % 2 === k) };
  const heard: HeardMix[] = [];
  for (const mix of buildMixes(half, MIXES_PER_HALF, 11 + k)) heard.push(await hearMix(mix));
  halves.push(heard);
}

/** Real takes, labeled whole: singing found where there is some, and none in talk. */
function readReal(model: SingingModel) {
  let right = 0;
  let falseAlarms = 0;
  const wrong: string[] = [];
  for (const [prefix, heard] of real) {
    const spans = sungStretches(heard.frames, heard.sound, heard.speech, model);
    const sung = !ALL_SPOKEN.includes(prefix);
    if (spans.length > 0 === sung) right++;
    else {
      falseAlarms += Number(!sung);
      wrong.push(
        `${prefix} ${sung ? "sung, none found" : "talk, found " + spans.map((s) => `${s.start.toFixed(2)}–${s.end.toFixed(2)}`).join(", ")}`,
      );
    }
  }
  return { right, falseAlarms, wrong };
}
const mixQuality = (s: BoundaryScore) => (within(s, 0.1) + within(s, 0.25)) / 2 - (s.missed + s.extra) / s.wanted;

let model = SINGING_MODEL;
if (!process.argv.includes("--check")) {
  // Each half of the mixes is judged by evidence weights fitted without it; the two decoding
  // settings are chosen by how well they read both halves and the real takes.
  const folds = [0, 1].map((k) => fitEvidence([...halves[1 - k], ...wordLabeled]));
  const evidence = fitEvidence([...halves[0], ...halves[1], ...wordLabeled]);
  let best = { quality: -Infinity, model, report: "" };
  for (const evidenceWeight of EVIDENCE_WEIGHTS) {
    for (const switchChance of SWITCH_CHANCES) {
      const settings = { evidenceWeight, switchChance };
      const scores = [0, 1].map((k) => scoreMixes(halves[k], { ...folds[k], ...settings }));
      const candidate = { ...evidence, ...settings };
      const takes = readReal(candidate);
      const quality =
        scores.reduce((s, x) => s + mixQuality(x), 0) / 2 +
        (takes.right - FALSE_ALARM_COST * takes.falseAlarms) / real.size;
      if (quality > best.quality) best = { quality, model: candidate, report: scores.map(describeScore).join("\n  ") };
    }
  }
  model = best.model;
  console.log(
    `Mixed takes, each half read by a model fitted without it (evidence ×${model.evidenceWeight}, switch ${model.switchChance}):\n  ${best.report}`,
  );
  writeFileSync(
    MODEL_FILE,
    `// Written by \`yarn fit:singing\`; refit rather than edit.\nimport type { SingingModel } from "./singing-decoder";\n\nexport const SINGING_MODEL: SingingModel = ${JSON.stringify(model)};\n`,
  );
  console.log(`wrote ${MODEL_FILE}`);
} else {
  const reports = [0, 1].map((k) => describeScore(scoreMixes(halves[k], model)));
  console.log(`The model in the code, on its own training mixes:\n  ${reports.join("\n  ")}`);
}
const takes = readReal(model);
for (const line of takes.wrong) console.log(`  ✗ ${line}`);
console.log(
  `Real takes: ${takes.right}/${real.size} read as labeled (talk only, or some singing); ${takes.falseAlarms} talk taken for singing.`,
);

// Pitch, sound and words only: no audio leaves .takes/.
if (process.argv.includes("--fixture")) {
  const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
  const kept = FIXTURE.map((prefix) => {
    const heard = real.get(prefix)!;
    return {
      name: prefix,
      sung: !ALL_SPOKEN.includes(prefix),
      speech: heard.speech,
      start: heard.frames[0].time,
      hop: heard.frames[1].time - heard.frames[0].time,
      hz: heard.frames.map((f) => (f.frequency === null ? null : round(f.frequency, 1))),
      clarity: heard.frames.map((f) => round(f.clarity, 2)),
      sound: heard.sound.map((s) => [round(s.flux, 3), round(s.harmonicity, 3), round(s.syllableRhythm, 3)]),
    };
  });
  mkdirSync("tests/fixtures/voice", { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(kept));
  console.log(`wrote ${kept.length} takes to ${FIXTURE_FILE}`);
}
