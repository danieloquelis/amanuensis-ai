import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  barEvents,
  barStyle,
  createExample,
  everyEvent,
  findEvent,
  isNote,
  isRest,
  measureEvents,
  primaryVoiceId,
  setBarEvents,
  setBarStyle,
  voiceBars,
  voiceEvents,
  voiceIds,
  voiceLine,
  voiceOf,
} from "@/modules/score";

test("a bar holds one voice bar, for the primary voice", () => {
  const [measure] = createExample().measures;
  const bars = voiceBars(measure);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].voiceId, "voice-1");
  assert.deepEqual(bars[0].events, barEvents(measure));
  assert.deepEqual(measureEvents(measure), barEvents(measure));
  assert.deepEqual(barEvents(measure, "voice-2"), [], "a voice without a bar here is silent");
});

test("events written through the accessor are what the bar holds", () => {
  const [measure] = structuredClone(createExample()).measures;
  const [first] = barEvents(measure);
  setBarEvents(measure, [first]);
  assert.deepEqual(barEvents(measure), [first]);
  assert.throws(() => setBarEvents(measure, [first], "voice-9"), /no bar there/);
});

test("a bar style is set and cleared through the accessor", () => {
  const [measure] = structuredClone(createExample()).measures;
  assert.equal(barStyle(measure), undefined);
  setBarStyle(measure, "slashes");
  assert.equal(barStyle(measure), "slashes");
  assert.equal(voiceBars(measure)[0].style, "slashes");
  setBarStyle(measure, undefined);
  assert.equal(barStyle(measure), undefined);
});

test("score-wide views list every event, voice by voice", () => {
  const score = createExample();
  assert.deepEqual(voiceIds(score), ["voice-1"]);
  assert.equal(primaryVoiceId(score), "voice-1");
  assert.deepEqual(
    voiceEvents(score).map((e) => e.id),
    everyEvent(score).map((e) => e.id),
  );
  assert.equal(voiceOf(score, "note-1-2"), "voice-1");
  assert.equal(voiceOf(score, "missing"), null);
  assert.deepEqual(voiceLine(score, "note-1-2"), voiceEvents(score));
});

test("finding an event names its voice and voice bar", () => {
  const found = findEvent(createExample(), "note-1-2")!;
  assert.equal(found.voiceId, "voice-1");
  assert.equal(found.voiceBar.events[found.eventIndex].id, "note-1-2");
});

test("notes and rests are told apart by the accessor", () => {
  const score = applyCommand(createExample(), {
    requestId: "rest",
    expectedRevision: 0,
    operation: { type: "setPitch", eventId: "note-0-0", pitch: null },
  });
  const [rest, note] = barEvents(score.measures[0]);
  assert.ok(isRest(rest) && !isNote(rest));
  assert.ok(isNote(note) && !isRest(note));
});
