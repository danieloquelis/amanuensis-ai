import { test } from "node:test";
import assert from "node:assert/strict";
import {
  add,
  applyCommand,
  beats,
  createExample,
  createSession,
  execute,
  fraction,
  parseScore,
  travel,
  type Operation,
} from "@/modules/score";
import { createPlaybackPlan } from "@/modules/playback";
import { layoutScore } from "@/modules/engraving";

function edit(score: ReturnType<typeof createExample>, operation: Operation, requestId = "test") {
  return applyCommand(score, { expectedRevision: score.revision, requestId, operation });
}

test("rational rhythm is exact, and every example measure is complete", () => {
  assert.deepEqual(add(add(fraction(1, 3), fraction(1, 3)), fraction(1, 3)), fraction(1));
  const score = parseScore(createExample());
  for (const measure of score.measures)
    assert.equal(
      measure.events.reduce((sum, event) => sum + beats(event.duration), 0),
      4,
    );
});

test("shortening leaves editable space; lengthening consumes it without changing note IDs", () => {
  const original = createExample();
  const shorter = edit(original, { type: "setDuration", eventId: "note-0-0", duration: 0.5 });
  assert.equal(shorter.measures[0].events.length, 5);
  assert.equal(shorter.measures[0].events[1].pitch, null);
  assert.equal(shorter.measures[0].events[1].gap, true);
  assert.equal(beats(shorter.measures[0].events[1].duration), 0.5);
  assert.equal(parseScore(JSON.parse(JSON.stringify(shorter))).measures[0].events[1].gap, true);
  assert.equal(createPlaybackPlan(shorter).events[1].frequency, null);
  const restored = edit(shorter, { type: "setDuration", eventId: "note-0-0", duration: 1 }, "restore");
  assert.deepEqual(restored.measures, original.measures);
  assert.throws(() => edit(original, { type: "setDuration", eventId: "note-0-0", duration: 2 }), /Make space/);
  assert.equal(edit(original, { type: "removeEvent", eventId: "note-0-0" }, "remove").measures[0].events[0].gap, true);
  assert.equal(
    edit(original, { type: "setPitch", eventId: "note-0-0", pitch: null }, "rest").measures[0].events[0].gap,
    undefined,
  );
  const rest = edit(original, { type: "setPitch", eventId: "note-0-0", pitch: null }, "rest-short");
  assert.equal(
    edit(rest, { type: "setDuration", eventId: "note-0-0", duration: 0.5 }, "split-rest").measures[0].events[1].gap,
    undefined,
  );
  assert.equal(original.revision, 0);
});

test("stale agent writes cannot overwrite a newer manual edit", () => {
  const score = edit(createExample(), {
    type: "setPitch",
    eventId: "note-0-0",
    pitch: { step: "D", octave: 4, alter: 0 },
  });
  assert.throws(
    () =>
      applyCommand(score, {
        requestId: "stale",
        expectedRevision: 0,
        operation: { type: "setPitch", eventId: "note-0-0", pitch: null },
      }),
    /score changed/,
  );
  assert.equal(score.measures[0].events[0].pitch?.step, "D");
});

test("duplicate requests are idempotent and changed payloads are rejected", () => {
  const session = createSession(createExample());
  const command = { requestId: "unique", expectedRevision: 0, operation: { type: "appendMeasure" as const } };
  const next = execute(session, command);
  assert.equal(execute(next, command), next);
  assert.throws(() => execute(next, { ...command, operation: { type: "setTempo", tempo: 100 } }), /reused/);
});

test("undo/redo preserve content, increase revision, and new edits clear redo", () => {
  const initial = createSession(createExample());
  const changed = execute(initial, {
    requestId: "tempo",
    expectedRevision: 0,
    operation: { type: "setTempo", tempo: 120 },
  });
  const undone = travel(changed, "undo");
  assert.equal(undone.score.tempo, 88);
  assert.equal(undone.score.revision, 2);
  const redone = travel(undone, "redo");
  assert.equal(redone.score.tempo, 120);
  assert.equal(redone.score.revision, 3);
  const branch = execute(undone, {
    requestId: "branch",
    expectedRevision: 2,
    operation: { type: "setTempo", tempo: 100 },
  });
  assert.equal(branch.future.length, 0);
});

test("native file validation rejects bad bars, duplicate IDs, unsupported content and invalid pitch", () => {
  const invalid = createExample();
  invalid.measures[0].events.pop();
  assert.throws(() => parseScore(invalid), /four beats/);
  const duplicate = createExample();
  duplicate.measures[1].id = duplicate.measures[0].id;
  assert.throws(() => parseScore(duplicate), /unique/);
  assert.throws(() => parseScore({ ...createExample(), secretUnsupportedNotation: true }), /unsupported/);
  assert.throws(
    () => edit(createExample(), { type: "setPitch", eventId: "note-0-0", pitch: { step: "C", alter: 0, octave: 7 } }),
    /Invalid operation/,
  );
  assert.deepEqual(parseScore(JSON.parse(JSON.stringify(createExample()))), createExample());
});

test("playback uses tempo and pitch, preserves rests, and keeps notation IDs", () => {
  const score = edit(createExample(), { type: "setTempo", tempo: 120 });
  const rest = edit(score, { type: "setPitch", eventId: "note-0-0", pitch: null }, "rest");
  const plan = createPlaybackPlan(rest);
  assert.equal(plan.duration, 8);
  assert.equal(plan.events[0].frequency, null);
  assert.equal(plan.events[1].start, 0.5);
  const a = plan.events.find((event) => event.id === "note-1-3")!;
  assert.equal(a.frequency, 440);
  assert.equal(a.duration, 1);
});

test("engraving has stable identity, middle-C ledger lines and beat-aligned eighth beams", () => {
  const scene = layoutScore(createExample());
  assert.equal(scene.systems.length, 2);
  assert.deepEqual(scene.systems[0].events[0].ledgerLines, [150]);
  assert.equal(scene.systems[0].beams.length, 1);
  assert.deepEqual(scene.systems[0].beamedIds, ["note-1-1", "note-1-2"]);
  assert.deepEqual(layoutScore(parseScore(createExample())), scene);
});

test("accidental state repeats only when changed and resets at each bar", () => {
  let score = createExample();
  for (const id of ["note-0-1", "note-0-3", "note-1-0"])
    score = edit(score, { type: "setPitch", eventId: id, pitch: { step: "E", octave: 4, alter: -1 } }, id);
  const events = layoutScore(score).systems[0].events;
  assert.equal(events[1].accidental, -1);
  assert.equal(events[3].accidental, null);
  assert.equal(events[4].accidental, -1);
});
