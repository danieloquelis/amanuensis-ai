import { test } from "node:test";
import assert from "node:assert/strict";
import {
  octaveEdit,
  phraseArticulationEdit,
  pickedEvents,
  selectionAnchors,
  slurEdit,
  slurKeyEdit,
  type SheetRef,
} from "@/modules/editor";
import { layoutScore, type System } from "@/modules/engraving";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
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
const pitchOf = (score: Score, id: string) => pitchName(findEvent(score, id)!.event.pitch);
const bar1 = ["note-0-0", "note-0-1", "note-0-2", "note-0-3"];
const notes = (ids: string[]): SheetRef[] => ids.map((id) => ({ kind: "event", id }));
// The example's first bar is C4 E4 G4 E4; bar 2 is D4 F4 G4 A4.
const slurred = (from = "note-0-0", to = "note-0-3") =>
  edit(createExample(), { type: "putSlur", startEventId: from, endEventId: to });

test("a slur joins a phrase and reads as one in the agent's view", () => {
  const score = slurred("note-0-1", "note-1-0");
  assert.equal(score.slurs.length, 1);
  assert.deepEqual(describeScore(score).slurs, [{ id: score.slurs[0].id, from: "bar 1, beat 2", to: "bar 2, beat 1" }]);
  const removed = edit(score, { type: "removeNotation", id: score.slurs[0].id });
  assert.equal(removed.slurs.length, 0);
});

test("rests at either end of a slurred range are left out", () => {
  const withRests = edit(createExample(), {
    type: "batch",
    operations: [
      { type: "removeEvent", eventId: "note-0-0" },
      { type: "removeEvent", eventId: "note-0-3" },
    ],
  });
  const score = edit(withRests, { type: "putSlur", startEventId: "note-0-0", endEventId: "note-0-3" });
  assert.deepEqual(
    score.slurs.map((s) => [s.startEventId, s.endEventId]),
    [["note-0-1", "note-0-2"]],
  );
  assert.throws(
    () => edit(withRests, { type: "putSlur", startEventId: "note-0-2", endEventId: "note-0-3" }),
    /two notes/,
  );
});

test("a new slur replaces any slur it overlaps; stored slurs never overlap", () => {
  const score = edit(slurred("note-0-0", "note-0-2"), {
    type: "putSlur",
    startEventId: "note-0-2",
    endEventId: "note-1-1",
  });
  assert.deepEqual(
    score.slurs.map((s) => [s.startEventId, s.endEventId]),
    [["note-0-2", "note-1-1"]],
  );
  const overlapping = structuredClone(score);
  overlapping.slurs.push({ id: "other", startEventId: "note-0-0", endEventId: "note-0-3" });
  assert.throws(() => parseScore(overlapping), /overlap/);
});

test("a slur whose end note is gone is removed with it", () => {
  const score = edit(slurred("note-0-2", "note-1-1"), { type: "deleteMeasure", measureId: "bar-2" });
  assert.equal(score.slurs.length, 0);
});

test("an octave keeps accidentals; other moves stay in the key; rests and ties come along", () => {
  const sharp = edit(createExample(), {
    type: "setPitch",
    eventId: "note-0-1",
    pitch: { step: "E", alter: -1, octave: 4 },
  });
  const up = edit(sharp, { type: "transpose", eventIds: bar1, steps: 7 });
  assert.deepEqual(
    bar1.map((id) => pitchOf(up, id)),
    ["C5", "E♭5", "G5", "E5"],
  );
  const third = edit(sharp, { type: "transpose", eventIds: ["note-0-1"], steps: 2 });
  assert.equal(pitchOf(third, "note-0-1"), "G4");
  const tied = edit(createExample(), { type: "setTie", eventId: "note-0-3", tied: true });
  const moved = edit(tied, { type: "transpose", eventIds: ["note-0-3"], steps: -7 });
  assert.equal(pitchOf(moved, "note-1-0"), "E3");
  // Every pitch stays within A0–C8, the piano keyboard: four octaves below middle C is too far.
  const low = edit(createExample(), { type: "transpose", eventIds: bar1, steps: -21 });
  assert.throws(() => edit(low, { type: "transpose", eventIds: bar1, steps: -7 }), /A0–C8/);
});

test("the multi-selection tools build one edit for the whole phrase", () => {
  const score = createExample();
  const ids = pickedEvents(score, notes(["note-0-3", "note-0-1", "note-0-2"]))!;
  assert.deepEqual(ids, ["note-0-1", "note-0-2", "note-0-3"]);
  assert.equal(
    pickedEvents(score, [
      { kind: "event", id: "note-0-1" },
      { kind: "bar", id: "bar-1" },
    ]),
    null,
  );

  const withSlur = edit(score, slurEdit(score, ids)!.operation);
  assert.equal(slurEdit(withSlur, ids)!.operation.type, "removeNotation");

  const accented = edit(score, phraseArticulationEdit(score, ids, "accent")!.operation);
  assert.ok(ids.every((id) => findEvent(accented, id)!.event.articulation === "accent"));
  const cleared = edit(accented, phraseArticulationEdit(accented, ids, "accent")!.operation);
  assert.ok(ids.every((id) => !findEvent(cleared, id)!.event.articulation));

  assert.deepEqual(octaveEdit(ids, -1).operation, { type: "transpose", eventIds: ids, steps: -7 });
});

test("S on one note slurs it to the next note, skipping rests", () => {
  const score = edit(createExample(), { type: "removeEvent", eventId: "note-0-1" });
  const slur = slurKeyEdit(score, notes(["note-0-0"]), "note-0-0")!.operation;
  assert.deepEqual(slur, { type: "putSlur", startEventId: "note-0-0", endEventId: "note-0-2" });
  assert.equal(slurKeyEdit(score, notes(["note-3-0"]), "note-3-0"), null);
});

test("slurred notes run into each other; the last releases as usual", () => {
  const plan = createPlaybackPlan(slurred());
  const gates = bar1.map((id) => plan.events.find((e) => e.id === id)!.gate);
  assert.deepEqual(gates.slice(0, 3), [1, 1, 1]);
  assert.ok(gates[3] < 1);
});

/** Highest (lowest y) point of a slur arc, sampled along its cubic. */
const arcTop = (system: System) => {
  const slur = system.slurs[0];
  const at = (t: number) => {
    const chord = slur.y1 + (slur.y2 - slur.y1) * t;
    return chord + 3 * t * (1 - t) * slur.bulge;
  };
  return Math.min(...[0.25, 0.5, 0.75].map(at));
};

test("a slur goes under up-stem notes and over down-stem ones, clearing what it passes", () => {
  const below = layoutScore(slurred()).systems[0];
  assert.ok(below.slurs[0].bulge > 0, "under up-stems");
  const high = edit(slurred(), { type: "transpose", eventIds: bar1, steps: 7 });
  const above = layoutScore(high).systems[0];
  assert.ok(above.slurs[0].bulge < 0, "over down-stems");
  const inner = above.events.filter((e) => ["note-0-1", "note-0-2"].includes(e.event.id));
  assert.ok(
    inner.every((e) => arcTop(above) < e.y - 6),
    "clears the noteheads it passes",
  );
});

test("a slur across a line break is drawn on both lines", () => {
  let score = createExample();
  while (layoutScore(score).systems.length < 2) score = edit(score, { type: "duplicateMeasure", measureId: "bar-3" });
  const [first, second] = layoutScore(score).systems;
  const last = first.events.at(-1)!.event.id;
  const next = second.events[0].event.id;
  const systems = layoutScore(edit(score, { type: "putSlur", startEventId: last, endEventId: next })).systems;
  assert.equal(systems[0].slurs.length, 1);
  assert.equal(systems[1].slurs.length, 1);
  assert.equal(systems[0].slurs[0].slurId, systems[1].slurs[0].slurId);
});

/** Height of a slur arc at scene x: the chord plus the cubic's offset there. */
const arcYAt = (system: System, x: number) => {
  const slur = system.slurs[0];
  const t = (x - slur.x1) / (slur.x2 - slur.x1);
  return slur.y1 + (slur.y2 - slur.y1) * t + 3 * t * (1 - t) * slur.bulge;
};

test("a slur arcs over an accidental inside its span, its end note's included", () => {
  const high = edit(slurred(), { type: "transpose", eventIds: bar1, steps: 7 });
  const sharp = edit(high, { type: "setPitch", eventId: "note-0-3", pitch: { step: "F", alter: 1, octave: 5 } });
  const system = layoutScore(sharp).systems[0];
  const last = system.events.find((e) => e.event.id === "note-0-3")!;
  assert.equal(last.accidental, 1);
  assert.ok(arcYAt(system, last.x - 18) < last.y - 14, "passes above the sharp");
});

test("a slur can be drawn rounder or flatter without changing the music", () => {
  const score = slurred();
  const id = score.slurs[0].id;
  const rounder = edit(score, { type: "shapeSlur", id, lift: 12 });
  assert.equal(describeScore(rounder).slurs[0].lift, 12);
  const middle = (s: Score) => {
    const slur = layoutScore(s).systems[0].slurs[0];
    return arcYAt(layoutScore(s).systems[0], (slur.x1 + slur.x2) / 2);
  };
  // Under the notes, rounder means lower on the page: the middle moves by the lift.
  assert.ok(Math.abs(middle(rounder) - middle(score) - 12) < 0.01);
  const restored = edit(rounder, { type: "shapeSlur", id, lift: null });
  assert.equal(restored.slurs[0].lift, undefined);
  assert.deepEqual(restored.measures, score.measures);
});

test("the selection's tools make room for a slur over the picked notes", () => {
  const score = slurred();
  const anchors = selectionAnchors(score, notes(["note-0-1", "note-0-2"]));
  assert.deepEqual(anchors, ["event:note-0-1", "event:note-0-2", `slur:${score.slurs[0].id}`]);
  assert.deepEqual(selectionAnchors(score, notes(["note-1-0"])), ["event:note-1-0"]);
});
