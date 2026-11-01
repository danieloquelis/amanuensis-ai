// Local, free evaluation of sung-melody transcription (no API calls).
// Usage: yarn eval:voice                     synthetic suite with metrics
//        yarn eval:voice --file take.m4a [--from 22 --to 32.5] [--bpm 90] [--meter 3/4]   your own recording (macOS)
//                        [--key D] [--chords "Em A Dsus2 G"] (one per bar) [--start 0.5] [--snap]
//        yarn eval:voice --corpus [.takes] [--yin]   ear score on every kept take that has a truth.json
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyName, parseChordSymbol, pitchName, rankKeysForChords, type Meter } from "@/modules/score";
import {
  createTake,
  decodeWav,
  spanFrames,
  spanSignal,
  transcribeMelody,
  type ChordContext,
  type Signal,
} from "@/modules/voice";
import { createSwiftF0Tracker } from "@/modules/voice/server";
import { midi, singMelody, type SingerOptions, type SungNoteSpec } from "../tests/support/synthetic-voice";
import {
  chordsByBar,
  compareBars,
  corpusFolders,
  keyFromName,
  loadTakeWav,
  readHeardSpeech,
  readTruth,
} from "./lib/takes.mjs";

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const tune = (text: string): SungNoteSpec[] =>
  text.split(" ").map((token) => {
    const [name, beats] = token.split("/");
    return { midi: name === "r" ? null : midi(name), beats: Number(beats) };
  });

const MELODIES = {
  arpeggio: tune("C4/1 E4/1 G4/1 E4/1 D4/1 F4/1 A4/2"),
  eighths: tune("G4/0.5 A4/0.5 B4/0.5 C5/0.5 D5/1 B4/1 C5/2 r/2"),
  dotted: tune("E4/1.5 F4/0.5 G4/1 C5/1 B4/1.5 A4/0.5 G4/2"),
  repeated: tune("A4/1 A4/1 A4/1 F4/1 G4/1 G4/1 C4/2"),
  leaps: tune("C4/1 C5/1 G4/1 E4/1 F4/1 A4/1 C5/2"),
  "low voice": tune("C3/1 E3/1 G3/1 C4/1 B3/1 G3/1 C3/2"),
};

/** The changes each melody is sung over ("beat:symbol"), for conditions that know them. */
const CHANGES: Record<keyof typeof MELODIES, string> = {
  arpeggio: "0:C 4:Dm",
  eighths: "0:G 4:C",
  dotted: "0:C 4:G",
  repeated: "0:F 4:G 6:C",
  leaps: "0:C 4:F",
  "low voice": "0:C 4:G 6:C",
};

const chordsOf = (changes: string): ChordContext[] =>
  changes.split(" ").map((item) => {
    const [beat, symbol] = item.split(":");
    return { beat: Number(beat), ...parseChordSymbol(symbol)! };
  });

const AMATEUR = {
  pitchErrorCents: 40,
  driftCents: 50,
  vibratoCents: 40,
  timingJitter: 0.03,
  glideSeconds: 0.05,
  noise: 0.01,
};

type Condition = Omit<SingerOptions, "bpm"> & { chordsKnown?: boolean };

const CONDITIONS: Record<string, Condition> = {
  clean: {},
  vibrato: { vibratoCents: 50 },
  glides: { glideSeconds: 0.07, vibratoCents: 30 },
  "detuned +35c": { tuningCents: 35, vibratoCents: 30 },
  "loose timing ±30ms": { timingJitter: 0.03, vibratoCents: 30 },
  "noisy room": { noise: 0.03, vibratoCents: 30 },
  everything: { vibratoCents: 50, glideSeconds: 0.06, tuningCents: -30, timingJitter: 0.03, noise: 0.02 },
  "imperfect pitch ±35c": { pitchErrorCents: 35, vibratoCents: 30 },
  "drifting −60c": { driftCents: -60, vibratoCents: 30 },
  amateur: AMATEUR,
  "amateur, chords known": { ...AMATEUR, chordsKnown: true },
};

const written = (bars: ReturnType<typeof transcribeMelody>["bars"]) =>
  bars.map((bar) => bar.map((e) => `${e.pitch ? pitchName(e.pitch) : "r"}/${e.duration}`).join(" ")).join(" | ");

/** The melody as it should be written: shifted by the same whole octaves the pipeline chose. */
function expectedBars(melody: SungNoteSpec[], octaveShift = 0): string {
  // Expected notation: the melody itself, completed with rests to whole 4/4 bars.
  const total = melody.reduce((sum, n) => sum + n.beats, 0);
  const padded = melody.map((n) => ({ ...n, midi: n.midi === null ? null : n.midi + octaveShift * 12 }));
  if (total % 4) padded.push({ midi: null, beats: 4 - (total % 4) });
  const bars: string[][] = [[]];
  let used = 0;
  for (const note of padded) {
    if (used >= 4) {
      bars.push([]);
      used = 0;
    }
    bars.at(-1)!.push(`${note.midi === null ? "r" : pitchName(spell(note.midi))}/${note.beats}`);
    used += note.beats;
  }
  return bars.map((bar) => bar.join(" ")).join(" | ");
}

function spell(value: number) {
  const names = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
  const sharp = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0][value % 12] as 0 | 1;
  return { step: names[value % 12], alter: sharp, octave: Math.floor(value / 12) - 1 };
}

function runSuite() {
  const rows: string[] = [];
  let exact = 0;
  let pitchHits = 0;
  let pitchTotal = 0;
  let tempoHits = 0;
  let cases = 0;
  for (const [conditionName, condition] of Object.entries(CONDITIONS)) {
    let conditionExact = 0;
    for (const [melodyName, melody] of Object.entries(MELODIES)) {
      for (const bpm of [72, 96, 120]) {
        cases++;
        // Same take for both amateur conditions, so the chords' effect is measured alone.
        const seed = condition.chordsKnown ? cases - Object.keys(MELODIES).length * 3 : cases;
        const signal = singMelody(melody, { ...condition, bpm, seed });
        const chords = condition.chordsKnown ? chordsOf(CHANGES[melodyName as keyof typeof MELODIES]) : undefined;
        const given = transcribeMelody(signal, { bpm, chords });
        const isExact = written(given.bars) === expectedBars(melody, given.octaveShift);
        if (isExact) {
          exact++;
          conditionExact++;
        }
        const sungPitches = melody.filter((n) => n.midi !== null).map((n) => n.midi! + given.octaveShift * 12);
        const found = given.notes.map((n) => n.pitch);
        pitchTotal += sungPitches.length;
        pitchHits += sungPitches.filter((p, i) => found[i] === p).length;
        const estimated = transcribeMelody(signal).bpm;
        if (Math.abs(estimated - bpm) / bpm <= 0.05) tempoHits++;
        if (!isExact && process.argv.includes("--verbose")) {
          rows.push(
            `  ✗ ${conditionName} · ${melodyName} @${bpm}\n    want ${expectedBars(melody, given.octaveShift)}\n    got  ${written(given.bars)}`,
          );
        }
      }
    }
    const perCondition = Object.keys(MELODIES).length * 3;
    console.log(`${conditionName.padEnd(24)} exact notation ${conditionExact}/${perCondition}`);
  }
  console.log(
    `\nAll: exact notation ${exact}/${cases} (${Math.round((exact / cases) * 100)}%), ` +
      `pitch ${Math.round((pitchHits / pitchTotal) * 100)}%, tempo estimated within 5% ${tempoHits}/${cases}`,
  );
  if (rows.length) console.log(`\nMisses:\n${rows.join("\n")}`);
}

function runFile(path: string) {
  const dir = mkdtempSync(join(tmpdir(), "amanuensis-eval-"));
  const wav = join(dir, "take.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", path, wav]);
  const buffer = readFileSync(wav);
  let offset = 12;
  let signal: Signal | null = null;
  while (offset < buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      const pcm = new Int16Array(
        buffer.buffer.slice(buffer.byteOffset + offset + 8, buffer.byteOffset + offset + 8 + size),
      );
      signal = { samples: Float32Array.from(pcm, (v) => v / 32768), sampleRate: 24000 };
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!signal) throw new Error("Could not read audio");
  const from = Math.round(Number(argument("--from") ?? 0) * signal.sampleRate);
  const to = argument("--to") ? Math.round(Number(argument("--to")) * signal.sampleRate) : signal.samples.length;
  signal = { ...signal, samples: signal.samples.slice(from, to) };
  const bpm = argument("--bpm") ? Number(argument("--bpm")) : undefined;
  const meterText = argument("--meter");
  const meter = meterText
    ? (Object.fromEntries([
        ["numerator", +meterText.split("/")[0]],
        ["denominator", +meterText.split("/")[1]],
      ]) as Meter)
    : undefined;
  const chordText = argument("--chords");
  const barBeats = meter ? (meter.numerator * 4) / meter.denominator : 4;
  const chords = chordText?.split(" ").map((symbol, bar) => ({ beat: bar * barBeats, ...parseChordSymbol(symbol)! }));
  const keyText = argument("--key");
  const key = keyText ? rankKeysForChords([parseChordSymbol(keyText)!])[0].key : undefined;
  const startBeat = argument("--start") ? Number(argument("--start")) : undefined;
  const snapToChordTones = process.argv.includes("--snap");
  const started = Date.now();
  const result = transcribeMelody(signal, { bpm, meter, key, chords, startBeat, snapToChordTones });
  console.log(`${(signal.samples.length / 24000).toFixed(1)} s analysed in ${Date.now() - started} ms`);
  console.log(`Tempo: ${result.bpm} BPM ${result.tempoWasGiven ? "(given)" : "(estimated)"}`);
  if (result.transposedBy) console.log(`Transposed ${result.transposedBy} semitones into ${keyName(result.key)}`);
  console.log(`First note at beat ${result.startBeat} of bar 1${result.startBeatSure ? "" : " (a guess)"}`);
  if (result.octaveShift)
    console.log(
      `Written ${Math.abs(result.octaveShift)} octave(s) ${result.octaveShift > 0 ? "higher" : "lower"} than sung`,
    );
  console.log(
    "Notes:",
    result.notes
      .map((n) => `${pitchName(spell(Math.round(n.midi)))}${n.cents >= 0 ? "+" : ""}${n.cents}c@${n.start.toFixed(2)}s`)
      .join("  "),
  );
  console.log("Written:\n " + written(result.bars).split(" | ").join("\n "));
  for (const e of result.evidence) {
    const similar = e.similarRhythm.length ? `, rhythm like bar ${e.similarRhythm.join(", ")}` : "";
    console.log(`Bar ${e.bar}: ${e.confidence}, ${e.offCents} cents off, ${e.corrected} corrected${similar}`);
  }
  for (const warning of result.warnings) console.log("Warning:", warning);
}

/**
 * The ear alone on every take with a truth.json, given the options a good agent would choose
 * (key, chords, start, snapping and bar count from the truth). Free: no model or speech calls.
 * Pitch comes from SwiftF0, as in the app; --yin uses the built-in tracker instead.
 */
async function runCorpus(root: string) {
  const yin = process.argv.includes("--yin");
  const tracker = createSwiftF0Tracker();
  const folders = corpusFolders(root);
  if (!folders.length) return console.log(`No takes with a truth.json in ${root}.`);
  let right = 0;
  let total = 0;
  for (const folder of folders) {
    const truth = readTruth(folder)!;
    const audio = decodeWav(loadTakeWav(folder));
    const take = createTake(audio, readHeardSpeech(folder), yin ? undefined : await tracker.track(audio));
    const span = [...take.sung].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    const signal = span && spanSignal(take, span.id);
    if (!signal) {
      console.log(`${folder}: no singing found`);
      continue;
    }
    const result = transcribeMelody(signal, {
      frames: spanFrames(take, span.id)!,
      bpm: truth.bpm,
      key: truth.key ? keyFromName(truth.key) : undefined,
      // Labels are the notes meant in the key named, wherever it was sung: as asked for "in D".
      transpose: Boolean(truth.key),
      chords: chordsByBar(truth.chords),
      startBeat: truth.startBeat,
      snapToChordTones: truth.snap,
      bars: process.argv.includes("--no-bars") ? undefined : truth.bars.split(" | ").length,
    });
    const score = compareBars(truth.bars, written(result.bars));
    right += score.right;
    total += score.total;
    console.log(`${folder}: ear ${score.right}/${score.total}`);
    if (process.argv.includes("--verbose")) console.log(`  want ${truth.bars}\n  got  ${written(result.bars)}`);
  }
  console.log(`\nEar score: ${right}/${total} meant notes right (${Math.round((right / total) * 100)}%)`);
}

const file = argument("--file");
if (process.argv.includes("--corpus"))
  await runCorpus(argument("--corpus")?.startsWith("--") ? ".takes" : (argument("--corpus") ?? ".takes"));
else if (file) runFile(file);
else runSuite();
