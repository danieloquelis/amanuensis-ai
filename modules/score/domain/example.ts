import { createPart } from "./instruments";
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
const EXAMPLE_PART = { part: "part-1", staff: "staff-1", voice: "voice-1" };

export function createExample(): Score {
  return {
    schemaVersion: 3,
    id: "first-light",
    revision: 0,
    title: "First light",
    tempo: 88,
    annotations: [],
    repeats: [],
    chords: [],
    marks: [],
    slurs: [],
    parts: [createPart("piano", EXAMPLE_PART)],
    measures: OPENING_PHRASE.map((bar, barIndex) => ({
      id: `bar-${barIndex + 1}`,
      meter: { numerator: 4, denominator: 4 },
      voices: [
        {
          voiceId: EXAMPLE_PART.voice,
          events: bar.map(([step, octave, beats], noteIndex) => ({
            id: `note-${barIndex}-${noteIndex}`,
            pitch: { step, octave, alter: 0 },
            duration: durationFromBeats(beats),
          })),
        },
      ],
    })),
  };
}
