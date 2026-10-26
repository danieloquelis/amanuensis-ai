import { test } from "node:test";
import assert from "node:assert/strict";
import { letterNoteEdit, toggleRestOperation } from "@/modules/editor";
import { applyCommand, createExample, type Operation, type Score } from "@/modules/score";

// Each edit needs its own request ID: generated note and rest IDs derive from it.
let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { expectedRevision: score.revision, requestId: `test-${requests++}`, operation });
const restAt = (score: Score, eventId: string) => edit(score, { type: "setPitch", eventId, pitch: null });
const pitchOf = (score: Score, measure: number, event: number) => score.measures[measure].events[event].pitch;

test("typing a letter on a rest gives the nearest note to the previous one", () => {
  // Bar 2 starts after E4, so typing G gives G4, not G5 or G3.
  const score = restAt(createExample(), "note-1-0");
  const { operation } = letterNoteEdit(score, "note-1-0", "G");
  assert.deepEqual(pitchOf(edit(score, operation), 1, 0), { step: "G", octave: 4, alter: 0 });
});

test("typing a letter on a note changes it to the nearest note of that name", () => {
  const { operation, receipt } = letterNoteEdit(createExample(), "note-0-2", "B");
  assert.deepEqual(pitchOf(edit(createExample(), operation), 0, 2), { step: "B", octave: 4, alter: 0 });
  assert.equal(receipt, "Changed G4 to B4");
});

test("typed letters are spelled in the key signature", () => {
  const dMajor = edit(createExample(), { type: "setKey", key: { fifths: 2, mode: "major" } });
  const { operation } = letterNoteEdit(dMajor, "note-0-0", "F");
  assert.deepEqual(pitchOf(edit(dMajor, operation), 0, 0), { step: "F", octave: 4, alter: 1 });
});

test("typing a letter on a whole-bar rest enters a quarter note and keeps the bar full", () => {
  const cleared = edit(createExample(), { type: "clearMeasure", measureId: "bar-2" });
  const restId = cleared.measures[1].events[0].id;
  const { operation } = letterNoteEdit(cleared, restId, "A");
  const events = edit(cleared, operation).measures[1].events;
  assert.equal(events[0].pitch?.step, "A");
  assert.deepEqual(events[0].duration, { numerator: 1, denominator: 1 });
  assert.equal(events.length, 3, "a quarter note, then a quarter and a half rest");
});

test("the note/rest toggle silences a note without changing its length", () => {
  const event = createExample().measures[0].events[0];
  assert.deepEqual(toggleRestOperation(event, { fifths: 0, mode: "major" }), {
    type: "setPitch",
    eventId: "note-0-0",
    pitch: null,
  });
});
