import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barEvents,
  setBarEvents,
  applyCommand,
  beats,
  createExample,
  findEvent,
  parseScore,
  scoreText,
  type Operation,
  type Score,
} from "@/modules/score";

const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { expectedRevision: score.revision, requestId: `test-${score.revision}`, operation });
const bar = (score: Score, n: number) =>
  scoreText(score)
    .split("\n")
    .find((line) => line.startsWith(`bar ${n}:`));
const C4 = { step: "C", alter: 0, octave: 4 } as const;
const D4 = { step: "D", alter: 0, octave: 4 } as const;
const E4 = { step: "E", alter: 0, octave: 4 } as const;

/** The example with bar 1 written as no musician would: e h q. (the half hides beat 3), slurred, with a dynamic. */
function awkward(): Score {
  const score = structuredClone(createExample());
  setBarEvents(score.measures[0], [
    { id: "a", pitch: C4, duration: { numerator: 1, denominator: 2 }, articulation: "accent" },
    { id: "b", pitch: D4, duration: { numerator: 2, denominator: 1 } },
    { id: "c", pitch: E4, duration: { numerator: 3, denominator: 2 } },
  ]);
  score.slurs = [{ id: "s", startEventId: "a", endEventId: "b" }];
  score.annotations = [{ id: "f", targetId: "b", kind: "dynamic", text: "f" }];
  return parseScore(score);
}

test("a bar already in the score is written as a musician would on the next edit, whatever it is", () => {
  const score = edit(awkward(), { type: "rename", title: "Renamed" });
  assert.equal(bar(score, 1), "bar 1: (C4e!accent D4q.~ D4e) E4q. ; dynamics f@1.5");
});

test("a respelled note keeps its markings: the slur reaches its last part, the dynamic and accent stay", () => {
  const score = edit(awkward(), { type: "rename", title: "Renamed" });
  const [first, , last] = barEvents(score.measures[0]);
  assert.equal(first.articulation, "accent");
  assert.deepEqual(
    score.slurs.map((s) => [s.startEventId, s.endEventId]),
    [["a", last.id]],
  );
  assert.equal(score.annotations[0].targetId, "b");
});

test("a bar that already reads clearly keeps its notes and their IDs exactly", () => {
  const example = createExample();
  const score = edit(example, { type: "rename", title: "Renamed" });
  assert.deepEqual(score.measures, example.measures);
});

test("a length changed by hand is written to show the beat", () => {
  // Bar 2 is D4q F4e G4e A4h; with A4 gone, G4 on the off-beat of 2 grows to a half note.
  const rested = edit(createExample(), { type: "removeEvent", eventId: "note-1-3" });
  const score = edit(rested, { type: "setDuration", eventId: "note-1-2", duration: 2 });
  assert.equal(bar(score, 2), "bar 2: D4q F4e G4e~ G4q. re");
  assert.equal(beats(findEvent(score, "note-1-2")!.event.duration), 0.5);
});
