import { test } from "node:test";
import assert from "node:assert/strict";
import { createScoreToolGateway, scoreTools } from "@/modules/assistant";
import { createExample, createSession, type Session } from "@/modules/score";

function gateway() {
  let session: Session = createSession(createExample());
  const call = createScoreToolGateway(
    () => session,
    (next) => {
      session = next;
    },
  );
  return { call, current: () => session };
}

type Context = { revision: number; score: string; selected: string[]; vocabulary: { chordExamples: string[] } };

test("the context reads like a lead sheet: a line per bar, pitches and durations, selection as positions", () => {
  const { call } = gateway();
  const context = call("score_get_context", { selectedIds: ["note-1-1", "bar-3"] }) as unknown as Context;
  assert.match(context.score, /^bar 2: D4q F4e G4e A4h$/m);
  assert.deepEqual(context.selected, ["2#2", "3"]);
  assert.ok(context.vocabulary.chordExamples.length > 0);
});

test("score_edit names notes by position, and score_write writes whole bars", () => {
  const { call, current } = gateway();
  const tied = call("score_edit", {
    requestId: "agent-1",
    expectedRevision: 0,
    operation: { type: "setTie", eventId: "1#4", tied: true },
  });
  assert.equal(tied.ok, true);
  assert.equal(current().score.measures[0].events[3].tie, true);
  const written = call("score_write", { requestId: "agent-2", expectedRevision: 1, text: "bar 5: (C5q B4q A4q G4q)" });
  assert.equal(written.ok, true);
  assert.equal(current().score.measures.length, 5);
  assert.equal(current().score.slurs.length, 1);
  const missing = call("score_edit", {
    requestId: "agent-3",
    expectedRevision: 2,
    operation: { type: "removeNotation", id: "chord 2:3" },
  });
  assert.deepEqual(missing, { ok: false, error: "There is no chord 2:3 in the score." });
});

test("score_edit applies an explicit edit directly and says what changed", () => {
  const { call, current } = gateway();
  const result = call("score_edit", {
    requestId: "agent-1",
    expectedRevision: 0,
    operation: { type: "putChord", measureId: "bar-2", beat: 2, symbol: "Am7" },
  });
  assert.deepEqual(result, { ok: true, revision: 1, changes: ["Bar 2: changed"] });
  assert.equal(current().score.chords[0].quality, "m7");
});

test("a stale edit is rejected without changing the score", () => {
  const { call, current } = gateway();
  const result = call("score_edit", {
    requestId: "agent-2",
    expectedRevision: 7,
    operation: { type: "rename", title: "Too late" },
  });
  assert.equal(result.ok, false);
  assert.equal(current().score.title, "First light");
});

test("invalid arguments name the field that is wrong", () => {
  const { call } = gateway();
  const result = call("score_edit", {
    requestId: "agent-3",
    expectedRevision: 0,
    operation: { type: "setTempo", tempo: 900 },
  });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /at operation\.tempo:/);
});

test("a missing field is named even inside a batch, not just reported as invalid input", () => {
  const { call } = gateway();
  const errorOf = (operation: unknown) =>
    (call("score_edit", { requestId: "agent-4", expectedRevision: 0, operation }) as { error: string }).error;
  assert.match(errorOf({ type: "moveEvent", eventId: "note-0-1" }), /at operation\.beforeEventId:/);
  assert.match(
    errorOf({ type: "batch", operations: [{ type: "setDuration", eventId: "note-0-1" }] }),
    /at operation\.operations\.0\.duration:/,
  );
});

test("every operation reaches the model with its own description", () => {
  const edit = scoreTools.find((tool) => tool.name === "score_edit")!;
  const schema = JSON.stringify(edit.parameters);
  for (const operation of [
    "putChord",
    "setMeasureStyle",
    "putMark",
    "setSection",
    "moveAnnotation",
    "setKey",
    "newScore",
  ]) {
    assert.ok(schema.includes(`"${operation}"`), `${operation} is in the tool schema`);
  }
  assert.ok(schema.includes("Add a chord symbol"));
  assert.ok(schema.includes("Any number allowed"));
  assert.ok(schema.includes("Start a new song"));
});

test("an agent can write a whole lead sheet through the tools alone", () => {
  const { call, current } = gateway();
  const result = call("score_edit", {
    requestId: "agent-lead",
    expectedRevision: 0,
    operation: {
      type: "batch",
      operations: [
        { type: "setKey", key: { fifths: -1, mode: "major" } },
        { type: "setSection", measureId: "bar-1", label: "A" },
        { type: "putChord", measureId: "bar-1", beat: 0, symbol: "Fmaj7" },
        { type: "putChord", measureId: "bar-2", beat: 0, symbol: "Gm7" },
        { type: "putChord", measureId: "bar-2", beat: 2, symbol: "C7" },
        { type: "setMeasureStyle", measureId: "bar-3", style: "slashes" },
        { type: "setMeasureStyle", measureId: "bar-4", style: "repeat" },
        { type: "putMark", measureId: "bar-1", kind: "segno" },
        { type: "putMark", measureId: "bar-4", kind: "dsAlFine" },
        { type: "putMark", measureId: "bar-2", kind: "fine" },
      ],
    },
  });
  assert.equal(result.ok, true);
  const score = current().score;
  assert.equal(score.chords.length, 3);
  assert.equal(score.marks.length, 3);
  assert.deepEqual(
    score.measures.map((m) => m.style ?? "notes"),
    ["notes", "notes", "slashes", "repeat"],
  );
});
