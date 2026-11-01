import { test } from "node:test";
import assert from "node:assert/strict";
import { readRhythm, transcribeMelody, tripletFeel } from "@/modules/voice";
import { midi, singMelody } from "../support/synthetic-voice";

const BPM = 90;
const BEAT = 60 / BPM;
/** Small timing errors, as a singer makes them (seconds), repeating so the test is deterministic. */
const JITTER = [0.01, -0.012, 0.006, -0.008, 0.011, -0.004, 0.009, -0.01];

/** A bar of quarters with beat 2 split as `split` (beats inside it), then a second plain bar; as sung onsets. */
function sung(split: number[]): number[] {
  const beats = [0, ...split.map((b) => 1 + b), 2, 3, 4, 5, 6, 7];
  return beats.map((beat, i) => beat * BEAT + JITTER[i % JITTER.length]);
}
/** As the transcriber reads it: positions from the first note, which starts bar 1 here. */
const feel = (onsets: number[]) => {
  const { positions } = readRhythm(onsets, { barBeats: 4, bpm: BPM });
  return tripletFeel(
    onsets,
    positions.map((p) => p - positions[0]),
    BPM,
    4,
  );
};

test("three notes sung evenly across a beat are heard as a triplet the grid wrote straight", () => {
  assert.deepEqual(feel(sung([0, 1 / 3, 2 / 3])), [{ bar: 1, beat: 1 }]);
});

test("straight figures of three or four notes in a beat are not mistaken for triplets", () => {
  assert.deepEqual(feel(sung([0, 0.5, 0.75])), [], "eighth and two sixteenths");
  assert.deepEqual(feel(sung([0, 0.25, 0.5])), [], "two sixteenths and an eighth");
  assert.deepEqual(feel(sung([0, 0.25, 0.5, 0.75])), [], "four sixteenths");
  assert.deepEqual(feel(sung([0, 0.5])), [], "two eighths");
});

test("a sung take with a triplet reports it with where it is; a straight take reports none", () => {
  const note = (name: string, beats: number) => ({ midi: midi(name), beats });
  const bar2 = [note("G4", 1), note("A4", 1), note("G4", 1), note("E4", 1)];
  const triplet = [
    note("C4", 1),
    note("D4", 1 / 3),
    note("E4", 1 / 3),
    note("F4", 1 / 3),
    note("G4", 1),
    note("E4", 1),
    ...bar2,
  ];
  const straight = [
    note("C4", 1),
    note("D4", 0.5),
    note("E4", 0.25),
    note("F4", 0.25),
    note("G4", 1),
    note("E4", 1),
    ...bar2,
  ];
  const heard = (melody: typeof triplet) =>
    transcribeMelody(singMelody(melody, { bpm: BPM, timingJitter: 0.008, seed: 7 }), { bpm: BPM, startBeat: 0 })
      .triplets;
  assert.deepEqual(heard(triplet), [{ bar: 1, beat: 1 }]);
  assert.deepEqual(heard(straight), []);
});
