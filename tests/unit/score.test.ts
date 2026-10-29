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

test("shortening a note fills the rest of its value with silence", () => {
  const shorter = edit(createExample(), { type: "setDuration", eventId: "note-0-0", duration: 0.5 });
  const [note, rest] = shorter.measures[0].events;
  assert.equal(beats(note.duration), 0.5);
  assert.equal(rest.pitch, null);
  assert.equal(beats(rest.duration), 0.5);
  assert.deepEqual(createPlaybackPlan(shorter).events[1].notes, []);
});

test("lengthening a note consumes the rests after it and keeps note IDs", () => {
  const original = createExample();
  const shorter = edit(original, { type: "setDuration", eventId: "note-0-0", duration: 0.5 });
  const restored = edit(shorter, { type: "setDuration", eventId: "note-0-0", duration: 1 }, "restore");
  assert.deepEqual(restored.measures, original.measures);
});

test("a note cannot grow over the next note", () => {
  assert.throws(() => edit(createExample(), { type: "setDuration", eventId: "note-0-0", duration: 2 }), /Make space/);
});

test("deleting a note leaves a rest of the same length", () => {
  const removed = edit(createExample(), { type: "removeEvent", eventId: "note-0-0" });
  assert.deepEqual(removed.measures[0].events[0], {
    id: "note-0-0",
    pitch: null,
    duration: { numerator: 1, denominator: 1 },
  });
});

test("rests complete the beat first, then follow the beats of a simple meter", () => {
  const score = edit(createExample(), { type: "setDuration", eventId: "note-3-0", duration: 0.5 });
  assert.deepEqual(
    score.measures[3].events.slice(1).map((e) => beats(e.duration)),
    [0.5, 1, 2],
  );
});

test("rests follow dotted-quarter beats in compound meter", () => {
  const sixEight = edit(createExample(), {
    type: "setMeter",
    measureIds: ["bar-4"],
    meter: { numerator: 6, denominator: 8 },
    policy: "scale",
  });
  const score = edit(sixEight, { type: "setDuration", eventId: "note-3-0", duration: 0.5 }, "shorten");
  assert.deepEqual(
    score.measures[3].events.slice(1).map((e) => beats(e.duration)),
    [0.5, 0.5, 1.5],
  );
});

test("drafts saved with the old empty-space marker open as ordinary rests", () => {
  const legacy = JSON.parse(JSON.stringify(createExample()));
  legacy.measures[0].events[0] = { id: "note-0-0", pitch: null, duration: { numerator: 1, denominator: 1 }, gap: true };
  const opened = parseScore(legacy);
  assert.deepEqual(opened.measures[0].events[0], {
    id: "note-0-0",
    pitch: null,
    duration: { numerator: 1, denominator: 1 },
  });
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
  assert.deepEqual(plan.events[0].notes, []);
  assert.equal(plan.events[1].start, 0.5);
  const a = plan.events.find((event) => event.id === "note-1-3")!;
  assert.deepEqual(a.notes, [69]);
  assert.equal(a.duration, 1);
});

test("engraving has stable identity, middle-C ledger lines and beat-aligned eighth beams", () => {
  const scene = layoutScore(createExample());
  // Four short bars fit comfortably on one justified line.
  assert.equal(scene.systems.length, 1);
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

test("a new score is blank, with sensible defaults, and the old song is one undo away", () => {
  const session = createSession(edit(createExample(), { type: "putChord", measureId: "bar-1", beat: 0, symbol: "C" }));
  const started = execute(session, {
    requestId: "fresh",
    expectedRevision: session.score.revision,
    operation: { type: "newScore" },
  });
  const blank = started.score;
  assert.equal(blank.title, "Untitled");
  assert.equal(blank.tempo, 100);
  assert.notEqual(blank.id, session.score.id);
  assert.equal(blank.measures.length, 4);
  assert.ok(blank.measures.every((measure) => measure.events.length === 1 && measure.events[0].measureRest));
  assert.deepEqual([blank.chords, blank.annotations, blank.marks, blank.repeats], [[], [], [], []]);
  assert.deepEqual(travel(started, "undo").score.chords, session.score.chords);
});

test("a new score can start in the musician's meter, key, tempo and length", () => {
  const blank = edit(createExample(), {
    type: "newScore",
    title: "Waltz for June",
    meter: { numerator: 3, denominator: 4 },
    bars: 8,
    tempo: 132,
    key: { fifths: 1, mode: "major" },
  });
  assert.equal(blank.title, "Waltz for June");
  assert.equal(blank.measures.length, 8);
  assert.equal(beats(blank.measures[0].events[0].duration), 3);
  assert.deepEqual(blank.key, { fifths: 1, mode: "major" });
  assert.equal(blank.tempo, 132);
});
