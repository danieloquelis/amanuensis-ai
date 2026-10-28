import { test } from "node:test";
import assert from "node:assert/strict";
import { readRhythm, reportTempo } from "@/modules/voice";

/** The El Muelle figure: where its eight notes start in a 4/4 bar (beats). */
const FIGURE = [0, 0.5, 1, 1.5, 1.75, 2.5, 3, 3.5];
const BARS = 4;
const written = Array.from({ length: BARS }, (_, bar) => FIGURE.map((beat) => bar * 4 + beat)).flat();
/** Small timing errors, as a singer makes them (seconds), repeating so the test is deterministic. */
const JITTER = [0.012, -0.015, 0.006, -0.004, 0.014, -0.01, 0.003, -0.012];

/** Performed onsets: `bpm` inside each bar and `breath` seconds taken before each new bar. */
function perform(bpm: number, breath: number): number[] {
  return written.map((beat, i) => beat * (60 / bpm) + Math.floor(beat / 4) * breath + JITTER[i % JITTER.length]);
}

test("a singer who rushes and breathes before each barline is still read in steady bars", () => {
  // They meant 80 BPM but sang at 88 inside each bar and took a breath at every barline.
  const reading = readRhythm(perform(88, 0.2), { barBeats: 4, bpm: 80, bars: BARS });
  assert.deepEqual(reading.positions, written);
});

test("the reading's tempo map follows the singer, not the spoken tempo", () => {
  const reading = readRhythm(perform(88, 0), { barBeats: 4, bpm: 80, bars: BARS });
  assert.ok(Math.min(...reading.tempi) >= 84 && Math.max(...reading.tempi) <= 92, `tempi ${reading.tempi}`);
});

test("steady eighths with a spoken tempo are not read in double time", () => {
  const eighths = Array.from({ length: 16 }, (_, i) => i * (60 / 90 / 2));
  const reading = readRhythm(eighths, { barBeats: 4, bpm: 90 });
  assert.deepEqual(
    reading.positions,
    eighths.map((_, i) => i * 0.5),
  );
});

test("double time is reported as fitting as well, a doubt only the musician's words settle", () => {
  const report = reportTempo([perform(88, 0)], { barBeats: 4 });
  assert.ok(Math.abs(report.bpm - 88) <= 2, `bpm ${report.bpm}`);
  // Half time would need 32nd notes for the figure's sixteenth, so it does not fit.
  assert.deepEqual(
    report.alternatives.map((a) => a.fit),
    ["about as likely", "unlikely"],
  );
});

test("saying how many bars the singing fills settles double time", () => {
  const report = reportTempo([perform(88, 0)], { barBeats: 4, bars: BARS });
  assert.equal(report.alternatives[0].fit, "unlikely");
});
