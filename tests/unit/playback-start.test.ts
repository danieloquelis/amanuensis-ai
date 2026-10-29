import { test } from "node:test";
import assert from "node:assert/strict";
import { playbackStart } from "@/modules/editor";
import { createPlaybackPlan } from "@/modules/playback";
import { applyCommand, createExample, type Operation, type Score } from "@/modules/score";

const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: "test", expectedRevision: score.revision, operation });

test("playing from a bar starts at its first note, at time zero", () => {
  const plan = createPlaybackPlan(createExample(), "bar-3");
  assert.equal(plan.events[0].id, "note-2-0");
  assert.equal(plan.events[0].start, 0);
  assert.equal(plan.events.length, 5);
  assert.equal(plan.duration, createPlaybackPlan(createExample()).duration / 2);
});

test("playing from a bar keeps the tempo already in force there", () => {
  const faster = edit(createExample(), { type: "setTempo", tempo: 176, measureId: "bar-2" });
  const plan = createPlaybackPlan(faster, "bar-3");
  assert.equal(plan.events[0].duration, 60 / 176);
});

test("playing from inside a repeat plays the rest of that pass, then the repeat", () => {
  const repeated = edit(createExample(), {
    type: "putRepeat",
    startMeasureId: "bar-1",
    endMeasureId: "bar-2",
    count: 2,
  });
  const ids = createPlaybackPlan(repeated, "bar-2").events.map((event) => event.id);
  assert.deepEqual(ids.slice(0, 5), ["note-1-0", "note-1-1", "note-1-2", "note-1-3", "note-0-0"]);
});

test("an unknown bar plays the whole score", () => {
  assert.deepEqual(createPlaybackPlan(createExample(), "missing"), createPlaybackPlan(createExample()));
});

test("playback starts at the earliest bar of whatever is selected", () => {
  const score = createExample();
  assert.equal(playbackStart(score, []), null);
  assert.deepEqual(
    playbackStart(score, [
      { kind: "event", id: "note-3-0" },
      { kind: "bar", id: "bar-2" },
    ]),
    { measureId: "bar-2", bar: 2 },
  );
  assert.equal(playbackStart(score, [{ kind: "event", id: "gone" }]), null);
});
