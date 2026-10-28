import { test } from "node:test";
import assert from "node:assert/strict";
import { barEvidence, type ResolvedNote } from "@/modules/voice";

/** A written note and how far from it the singer actually was. */
const sungAs = (pitch: number, offSemitones: number): ResolvedNote => ({
  start: 0,
  end: 0.3,
  midi: pitch + offSemitones,
  cents: 0,
  clarity: 1,
  pitch,
  alternative: null,
});
const figure = [
  { midi: null, beats: 0.5 },
  { midi: 64, beats: 0.5 },
  { midi: 67, beats: 1 },
  { midi: 71, beats: 2 },
];
const onsetsOfFigure = (bar: number) => [0.5, 1, 2].map((beat) => bar * 4 + beat);

test("bars that repeat one rhythm are pointed out as a figure", () => {
  const bars = [figure, figure, [{ midi: 64, beats: 4 }]];
  const notes = [...Array(7)].map(() => sungAs(64, 0));
  const onsets = [...onsetsOfFigure(0), ...onsetsOfFigure(1), 8];
  const evidence = barEvidence(notes, onsets, bars, 4);
  assert.deepEqual(
    evidence.map((e) => e.similarRhythm),
    [[2], [1], []],
  );
});

test("a bar the ear had to correct is flagged as low confidence", () => {
  const notes = [sungAs(64, 0.05), sungAs(67, -0.1), sungAs(71, 0), sungAs(64, 0.8), sungAs(67, -0.7), sungAs(71, 0.6)];
  const onsets = [...onsetsOfFigure(0), ...onsetsOfFigure(1)];
  const [clean, rough] = barEvidence(notes, onsets, [figure, figure], 4);
  assert.deepEqual([clean.confidence, rough.confidence, rough.corrected], ["high", "low", 3]);
});
