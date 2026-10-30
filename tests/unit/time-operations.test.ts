import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createExample, scoreText, writeBars, type Operation, type Score } from "@/modules/score";

// Moving music in time across barlines: one edit where the agent would otherwise rewrite every bar.

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `time-${requests++}`, expectedRevision: score.revision, operation });

/** A 4/4 score of `bars` bars holding the given score text. */
function score(text: string, bars = 4): Score {
  const base = createExample();
  const fresh = edit(base, { type: "newScore", bars });
  return writeBars(fresh, text, `w-${requests++}`).score;
}
const bars = (s: Score) =>
  scoreText(s)
    .split("\n")
    .filter((line) => line.startsWith("bar"));

test("removing a leading rest starts the tune on beat 1, pulling every bar after it earlier", () => {
  const tune = score("bar 1: rq C4q D4q E4q\nbar 2: F4q G4q A4q B4q\nbar 3: C5w ; chords C");
  const shifted = edit(tune, { type: "shiftTime", measureId: tune.measures[0].id, beat: 0, beats: -1 });
  assert.deepEqual(bars(shifted).slice(0, 4), [
    "bar 1: C4q D4q E4q F4q",
    "bar 2: G4q A4q B4q C5q~ ; chords C@4",
    "bar 3: C5h. rq",
    "bar 4: R",
  ]);
});

test("inserting a beat pushes the music later; a note pushed over a barline is tied across it", () => {
  const tune = score("bar 1: C4q D4q E4q F4q\nbar 2: G4w");
  const shifted = edit(tune, { type: "shiftTime", measureId: tune.measures[0].id, beat: 1, beats: 1 });
  assert.deepEqual(bars(shifted).slice(0, 3), ["bar 1: C4q rq D4q E4q", "bar 2: F4q G4h.~", "bar 3: G4q rq rh"]);
});

test("doubling the note values of a bar makes two bars, and the music after it moves on", () => {
  const tune = score("bar 1: C4q D4q E4q F4q\nbar 2: G4w ; chords G");
  const slower = edit(tune, { type: "stretchTime", measureIds: [tune.measures[0].id], factor: 2 });
  assert.deepEqual(bars(slower).slice(0, 3), ["bar 1: C4h D4h", "bar 2: E4h F4h", "bar 3: G4w ; chords G"]);
  const faster = edit(slower, {
    type: "stretchTime",
    measureIds: slower.measures.slice(0, 2).map((m) => m.id),
    factor: 0.5,
  });
  assert.deepEqual(bars(faster).slice(0, 2), ["bar 1: C4q D4q E4q F4q", "bar 2: G4w ; chords G"]);
});

test("music that would run past the last bar a score holds is refused, saying so", () => {
  const full = score("bar 1: C4w\nbar 32: C4w", 32);
  assert.throws(
    () => edit(full, { type: "stretchTime", measureIds: full.measures.map((m) => m.id), factor: 2 }),
    /run past bar 32/,
  );
});
