import { test } from "node:test";
import assert from "node:assert/strict";
import { rangeOfRefs, refExists, selectionName, toggleRef, type SheetRef } from "@/modules/editor";
import { createExample, createSession, execute } from "@/modules/score";

const score = createExample();
const note = (id: string): SheetRef => ({ kind: "event", id });
const bar = (id: string): SheetRef => ({ kind: "bar", id });

test("shift-clicking a later note picks every note between, across bars", () => {
  const picked = rangeOfRefs(score, note("note-0-2"), note("note-1-1"));
  assert.deepEqual(
    picked.map((r) => r.id),
    ["note-0-2", "note-0-3", "note-1-0", "note-1-1"],
  );
});

test("shift-clicking backwards picks the same range, ending on the clicked note", () => {
  const picked = rangeOfRefs(score, note("note-1-1"), note("note-0-3"));
  assert.deepEqual(
    picked.map((r) => r.id),
    ["note-1-1", "note-1-0", "note-0-3"],
  );
});

test("shift-clicking a bar after a bar picks the bars between", () => {
  assert.deepEqual(
    rangeOfRefs(score, bar("bar-2"), bar("bar-4")).map((r) => r.id),
    ["bar-2", "bar-3", "bar-4"],
  );
});

test("shift-clicking a different kind of thing starts over with just that thing", () => {
  assert.deepEqual(rangeOfRefs(score, note("note-0-0"), bar("bar-3")), [bar("bar-3")]);
});

test("cmd-clicking adds an item, and cmd-clicking it again removes it", () => {
  const added = toggleRef([bar("bar-1")], note("note-2-0"));
  assert.deepEqual(added, [bar("bar-1"), note("note-2-0")]);
  assert.deepEqual(toggleRef(added, bar("bar-1")), [note("note-2-0")]);
});

test("a selection has a short name a musician can say", () => {
  assert.equal(selectionName(score, [bar("bar-3")]), "Bar 3");
  assert.equal(selectionName(score, [note("note-0-1")]), "E4 · bar 1");
  assert.equal(selectionName(score, [bar("bar-2"), bar("bar-3"), bar("bar-4")]), "Bars 2–4");
  assert.equal(selectionName(score, [bar("bar-1"), bar("bar-3")]), "Bars 1, 3");
  assert.equal(selectionName(score, [note("note-0-3"), note("note-1-0")]), "2 notes · bars 1–2");
  assert.equal(selectionName(score, [bar("bar-1"), note("note-2-0")]), "2 items");
  assert.equal(selectionName(score, []), null);
});

test("a picked item removed by an edit no longer counts as picked", () => {
  const session = createSession(score);
  const next = execute(session, {
    requestId: "delete",
    expectedRevision: 0,
    operation: { type: "deleteMeasure", measureId: "bar-2" },
  });
  assert.deepEqual(
    [bar("bar-2"), note("note-1-0"), bar("bar-3")].map((ref) => refExists(next.score, ref)),
    [false, false, true],
  );
});
