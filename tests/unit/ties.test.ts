import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutScore } from "@/modules/engraving";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
  beats,
  createExample,
  describeScore,
  findEvent,
  parseScore,
  pitchName,
  type Operation,
  type Score,
} from "@/modules/score";

const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { expectedRevision: score.revision, requestId: `test-${score.revision}`, operation });
const pitchOf = (score: Score, id: string) => pitchName(findEvent(score, id)!.event.pitch!);
// In the example, bar 1 ends on E4 (note-0-3) and bar 2 starts on D4 (note-1-0).
const tiedOverBarline = () => edit(createExample(), { type: "setTie", eventId: "note-0-3", tied: true });

test("a tie across the barline holds the note: the next note takes its pitch", () => {
  const score = tiedOverBarline();
  assert.equal(findEvent(score, "note-0-3")!.event.tie, true);
  assert.equal(pitchOf(score, "note-1-0"), "E4");
  assert.equal(describeScore(score).bars[0].events[3].tiedToNext, true);
  const untied = edit(score, { type: "setTie", eventId: "note-0-3", tied: false });
  assert.equal(findEvent(untied, "note-0-3")!.event.tie, undefined);
});

test("tying into a rest holds the note on, written as the one longer value it now is", () => {
  const withRest = edit(createExample(), { type: "removeEvent", eventId: "note-0-2" });
  const score = edit(withRest, { type: "setTie", eventId: "note-0-1", tied: true });
  // E4 on beat 2, held through beat 3: a half note, as a musician writes it (not q~q).
  assert.equal(pitchOf(score, "note-0-1"), "E4");
  assert.equal(beats(findEvent(score, "note-0-1")!.event.duration), 2);
  assert.equal(findEvent(score, "note-0-2"), null);
});

test("tied notes change pitch together, from either end", () => {
  const score = tiedOverBarline();
  const fromStart = edit(score, { type: "setPitch", eventId: "note-0-3", pitch: { step: "F", alter: 1, octave: 4 } });
  assert.equal(pitchOf(fromStart, "note-1-0"), "F♯4");
  const fromEnd = edit(score, { type: "setPitch", eventId: "note-1-0", pitch: { step: "G", alter: 0, octave: 4 } });
  assert.equal(pitchOf(fromEnd, "note-0-3"), "G4");
  assert.equal(findEvent(fromEnd, "note-0-3")!.event.tie, true);
});

test("an edit that breaks a tie removes it instead of failing", () => {
  const score = tiedOverBarline();
  const rested = edit(score, { type: "removeEvent", eventId: "note-1-0" });
  assert.equal(findEvent(rested, "note-0-3")!.event.tie, undefined);
  const cleared = edit(score, { type: "clearMeasure", measureId: "bar-2" });
  assert.equal(findEvent(cleared, "note-0-3")!.event.tie, undefined);
});

test("only a note with something after it can be tied", () => {
  const score = createExample();
  assert.throws(() => edit(score, { type: "setTie", eventId: "note-3-0", tied: true }), /nothing to tie to/);
  const withRest = edit(score, { type: "removeEvent", eventId: "note-0-0" });
  assert.throws(() => edit(withRest, { type: "setTie", eventId: "note-0-0", tied: true }), /Only a note/);
});

test("whole bars can be written with a note held over the barline", () => {
  const C5 = { step: "C", alter: 0, octave: 5 } as const;
  const score = edit(createExample(), {
    type: "batch",
    operations: [
      {
        type: "replaceMeasure",
        measureId: "bar-1",
        events: [
          { pitch: null, duration: 2 },
          { pitch: C5, duration: 2, tie: true },
        ],
      },
      {
        type: "replaceMeasure",
        measureId: "bar-2",
        events: [
          { pitch: C5, duration: 2 },
          { pitch: null, duration: 2 },
        ],
      },
    ],
  });
  assert.equal(score.measures[0].events[1].tie, true);
  assert.equal(describeScore(score).bars[0].events[1].tiedToNext, true);
});

test("a stored tie between different pitches is invalid", () => {
  const broken = structuredClone(createExample());
  broken.measures[0].events[0].tie = true;
  assert.throws(() => parseScore(broken), /same pitch/);
});

test("tied notes sound once, for their whole held length", () => {
  const plan = createPlaybackPlan(tiedOverBarline());
  const held = plan.events.find((e) => e.id === "note-0-3")!;
  const continued = plan.events.find((e) => e.id === "note-1-0")!;
  assert.deepEqual(continued.notes, []);
  const soundingEnd = held.start + held.duration * held.gate;
  assert.ok(soundingEnd > continued.start + continued.duration * 0.9, "holds through the tied note");
  assert.ok(soundingEnd < continued.start + continued.duration, "releases before the next note");
});

test("playing from the bar a tie ends in still sounds the held note", () => {
  const plan = createPlaybackPlan(tiedOverBarline(), "bar-2");
  assert.equal(plan.events[0].id, "note-1-0");
  assert.notDeepEqual(plan.events[0].notes, []);
});

test("a tie arcs between its noteheads, away from the stems", () => {
  const system = layoutScore(tiedOverBarline()).systems[0];
  const [tie] = system.ties;
  const from = system.events.find((e) => e.event.id === "note-0-3")!;
  const to = system.events.find((e) => e.event.id === "note-1-0")!;
  assert.ok(tie.x1 > from.x && tie.x2 < to.x, "between the noteheads");
  assert.equal(tie.above, from.stemDown);
  assert.equal(tie.y > from.y, !from.stemDown);
});

test("a tie across a line break is drawn as two arcs, one on each line", () => {
  const twoLines = (score: Score) => layoutScore(score).systems.length > 1;
  let score = createExample();
  while (!twoLines(score)) score = edit(score, { type: "duplicateMeasure", measureId: "bar-3" });
  const [first, second] = layoutScore(score).systems;
  const lastOnLine = first.events.at(-1)!.event.id;
  const tied = layoutScore(edit(score, { type: "setTie", eventId: lastOnLine, tied: true })).systems;
  assert.equal(tied[0].ties.length, 1);
  assert.equal(tied[0].ties[0].x2, first.endX - 2);
  assert.equal(tied[1].ties.length, 1);
  assert.ok(tied[1].ties[0].x2 < second.events[0].x);
});
