import type { Step } from "./pitch";
import { durationFromBeats } from "./rhythm";
import type { Score } from "./schema";

type ExampleNote = [step: Step, octave: number, beats: number];

const OPENING_PHRASE: ExampleNote[][] = [
  [
    ["C", 4, 1],
    ["E", 4, 1],
    ["G", 4, 1],
    ["E", 4, 1],
  ],
  [
    ["D", 4, 1],
    ["F", 4, 0.5],
    ["G", 4, 0.5],
    ["A", 4, 2],
  ],
  [
    ["G", 4, 1],
    ["E", 4, 1],
    ["D", 4, 1],
    ["E", 4, 1],
  ],
  [["C", 4, 4]],
];

/** Hand-authored opening melody shown before the user has a saved score. */
export function createExample(): Score {
  return {
    schemaVersion: 2,
    id: "first-light",
    revision: 0,
    title: "First light",
    tempo: 88,
    annotations: [],
    repeats: [],
    chords: [],
    marks: [],
    measures: OPENING_PHRASE.map((bar, barIndex) => ({
      id: `bar-${barIndex + 1}`,
      meter: { numerator: 4, denominator: 4 },
      events: bar.map(([step, octave, beats], noteIndex) => ({
        id: `note-${barIndex}-${noteIndex}`,
        pitch: { step, octave, alter: 0 },
        duration: durationFromBeats(beats),
      })),
    })),
  };
}
