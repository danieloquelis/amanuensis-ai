import { test } from "node:test";
import assert from "node:assert/strict";
import { barEvents, applyCommand, beats, createExample, meterName, parseScore, type Operation } from "@/modules/score";
import { createPlaybackPlan } from "@/modules/playback";
import { layoutScore } from "@/modules/engraving";
import { createScoreToolGateway, createTurnEdits, scoreTools } from "@/modules/assistant";

const edit = (score: ReturnType<typeof createExample>, operation: Operation, requestId = "test") =>
  applyCommand(score, { expectedRevision: score.revision, requestId, operation });

test("4/4 → 6/8 → 4/4 is local, exact and reversible", () => {
  const original = createExample();
  const mixed = edit(original, {
    type: "setMeter",
    measureIds: ["bar-2"],
    meter: { numerator: 6, denominator: 8 },
    policy: "scale",
  });
  assert.deepEqual(
    mixed.measures.map((m) => meterName(m.meter)),
    ["4/4", "6/8", "4/4", "4/4"],
  );
  assert.deepEqual(
    barEvents(mixed.measures[1]).map((e) => beats(e.duration)),
    [0.75, 0.375, 0.375, 1.5],
  );
  assert.equal(createPlaybackPlan(mixed).events.find((e) => e.id === "note-2-0")?.beat, 7);
  const restored = edit(
    mixed,
    { type: "setMeter", measureIds: ["bar-2"], meter: { numerator: 4, denominator: 4 }, policy: "scale" },
    "restore",
  );
  assert.deepEqual(restored.measures, original.measures);
});

test("preserve-duration meter changes never cut notes and batches roll back together", () => {
  const score = createExample();
  assert.throws(
    () =>
      edit(score, {
        type: "batch",
        operations: [
          { type: "rename", title: "Must not persist" },
          { type: "setMeter", measureIds: ["bar-1"], meter: { numerator: 6, denominator: 8 }, policy: "preserve" },
        ],
      }),
    /cut notes/,
  );
  assert.equal(score.title, "First light");
  const rest = edit(score, { type: "removeEvent", eventId: "note-0-3" });
  const changed = edit(
    rest,
    { type: "setMeter", measureIds: ["bar-1"], meter: { numerator: 6, denominator: 8 }, policy: "preserve" },
    "meter",
  );
  // Three quarters in 6/8, written to show its dotted-quarter beats: q e~e q.
  assert.deepEqual(
    barEvents(changed.measures[0]).map((e) => beats(e.duration)),
    [1, 0.5, 0.5, 1],
  );
});

test("compound meter beams six eighths into two groups of three", () => {
  const score = edit(createExample(), {
    type: "batch",
    operations: [
      { type: "clearMeasure", measureId: "bar-1" },
      { type: "setMeter", measureIds: ["bar-1"], meter: { numerator: 6, denominator: 8 }, policy: "preserve" },
      {
        type: "replaceMeasure",
        measureId: "bar-1",
        events: Array.from({ length: 6 }, () => ({
          pitch: { step: "C" as const, octave: 4, alter: 0 as const },
          duration: 0.5 as const,
        })),
      },
    ],
  });
  const system = layoutScore(score).systems[0];
  const ids = new Set(barEvents(score.measures[0]).map((e) => e.id));
  assert.equal(system.beamedIds.filter((id) => ids.has(id)).length, 6);
  assert.equal(system.beams.filter((b) => b.x1 < system.bars[0].endX).length, 2);
});

test("repeats unfold, dynamics persist, articulation and tempo affect playback", () => {
  const score = edit(createExample(), {
    type: "batch",
    operations: [
      { type: "setTempo", tempo: 120 },
      { type: "setTempo", tempo: 60, measureId: "bar-2" },
      { type: "putRepeat", startMeasureId: "bar-1", endMeasureId: "bar-2", count: 2 },
      { type: "putAnnotation", targetId: "bar-1", kind: "dynamic", text: "p" },
      { type: "putAnnotation", targetId: "note-0-1", kind: "dynamic", text: "f" },
      { type: "setArticulation", eventId: "note-0-0", articulation: "staccato" },
      { type: "setArticulation", eventId: "note-0-1", articulation: "accent" },
    ],
  });
  const plan = createPlaybackPlan(score);
  assert.equal(plan.events.filter((e) => e.id === "note-0-0").length, 2);
  assert.equal(plan.events[0].gate, 0.45);
  assert.ok(plan.events[1].velocity > plan.events[0].velocity);
  assert.equal(plan.events.find((e) => e.id === "note-1-0")?.duration, 1);
  assert.equal(plan.duration, 20);
  assert.equal(plan.events[8].beat, 0);
});

test("indications preserve anchors through duplication and clean up on deletion", () => {
  let score = edit(createExample(), { type: "putAnnotation", targetId: "note-0-0", kind: "text", text: "dolce" });
  score = edit(score, { type: "duplicateMeasure", measureId: "bar-1" }, "copy");
  assert.equal(score.annotations.length, 2);
  assert.notEqual(score.annotations[0].targetId, score.annotations[1].targetId);
  score = edit(score, { type: "deleteMeasure", measureId: "bar-1" }, "delete");
  assert.equal(score.annotations.length, 1);
  assert.doesNotThrow(() => parseScore(score));
});

test("full-measure rests follow local meter including 5/4", () => {
  const score = edit(createExample(), {
    type: "batch",
    operations: [
      { type: "clearMeasure", measureId: "bar-1" },
      { type: "setMeter", measureIds: ["bar-1"], meter: { numerator: 5, denominator: 4 }, policy: "preserve" },
    ],
  });
  assert.equal(barEvents(score.measures[0]).length, 1);
  assert.equal(barEvents(score.measures[0])[0].measureRest, true);
  assert.equal(beats(barEvents(score.measures[0])[0].duration), 5);
});

test("a bar lengthened to 6/4 is filled with rests that keep its two halves", () => {
  let score = edit(createExample(), {
    type: "setMeter",
    measureIds: ["bar-1"],
    meter: { numerator: 2, denominator: 4 },
    policy: "auto",
  });
  score = edit(
    score,
    {
      type: "setMeter",
      measureIds: ["bar-1"],
      meter: { numerator: 6, denominator: 4 },
      policy: "preserve",
    },
    "six",
  );
  const rests = barEvents(score.measures[0]).filter((event) => event.pitch === null);
  assert.deepEqual(
    rests.map((rest) => beats(rest.duration)),
    [1, 3],
  );
});

test("v1 files migrate without losing identity or edits", () => {
  const original = createExample();
  const legacy = {
    ...original,
    schemaVersion: 1,
    measures: original.measures.map((measure) => ({ id: measure.id, events: barEvents(measure) })),
  } as Record<string, unknown>;
  delete legacy.parts;
  delete legacy.annotations;
  delete legacy.repeats;
  delete legacy.chords;
  delete legacy.marks;
  delete legacy.slurs;
  assert.deepEqual(parseScore(legacy), original);
});

test("AI tool previews do not mutate; stale applies fail; duplicate apply is safe", () => {
  const edits = createTurnEdits(createExample());
  const tools = createScoreToolGateway(edits);
  assert.equal(scoreTools.length, 6);
  const command = {
    requestId: "ai",
    expectedRevision: 0,
    operation: { type: "putAnnotation", targetId: "bar-1", kind: "text", text: "espressivo" },
  };
  assert.equal(tools("score_preview", command).ok, true);
  assert.equal(edits.score().annotations.length, 0);
  edits.execute({ requestId: "human", expectedRevision: 0, operation: { type: "setTempo", tempo: 100 } });
  assert.equal(tools("score_apply", { previewId: "ai", expectedRevision: 0 }).ok, false);
  assert.equal(tools("score_preview", { ...command, requestId: "fresh", expectedRevision: 1 }).ok, true);
  assert.equal(tools("score_apply", { previewId: "fresh", expectedRevision: 1 }).ok, true);
  assert.equal(tools("score_apply", { previewId: "fresh", expectedRevision: 1 }).ok, true);
  assert.equal(edits.score().annotations.length, 1);
  assert.equal(tools("score_preview", { ...command, operation: { type: "arbitraryCode" } }).ok, false);
});

test("bar spacing changes engraving but never musical timing, and persists", () => {
  const original = createExample();
  const naturalWidth = Math.round(layoutScore(original).systems[0].bars[0].width);
  const wider = edit(original, { type: "setMeasureWidth", measureId: "bar-1", width: naturalWidth + 40 });
  assert.deepEqual(createPlaybackPlan(wider), createPlaybackPlan(original));
  assert.deepEqual(barEvents(wider.measures[0]), barEvents(original.measures[0]));
  // The override sets the bar's engraved width; the rest of the line re-justifies around it.
  const widened = layoutScore(wider).systems[0];
  assert.equal(widened.bars[0].width, naturalWidth + 40);
  assert.equal(widened.endX, layoutScore(original).systems[0].endX);
  assert.equal(parseScore(JSON.parse(JSON.stringify(wider))).measures[0].width, naturalWidth + 40);
  assert.throws(() => edit(original, { type: "setMeasureWidth", measureId: "bar-1", width: 800 }), /Invalid operation/);
  assert.deepEqual(
    edit(wider, { type: "setMeasureWidth", measureId: "bar-1", width: null }, "reset").measures,
    original.measures,
  );
});

test("drag-style reorder can move to the end without changing durations or identity", () => {
  const original = createExample();
  const moved = edit(original, { type: "moveEvent", eventId: "note-0-0", beforeEventId: null });
  assert.deepEqual(
    barEvents(moved.measures[0]).map((e) => e.id),
    ["note-0-1", "note-0-2", "note-0-3", "note-0-0"],
  );
  assert.equal(createPlaybackPlan(moved).duration, createPlaybackPlan(original).duration);
  assert.throws(
    () => edit(original, { type: "moveEvent", eventId: "note-0-0", beforeEventId: "note-1-0" }),
    /within one measure/,
  );
});

test("with several staves, a slash bar must say which staff, and only that staff changes", () => {
  const withDrums = edit(createExample(), { type: "addPart", instrument: "drums" });
  assert.throws(
    () => edit(withDrums, { type: "setMeasureStyle", measureId: "bar-2", style: "slashes" }, "slash"),
    /Say which staff to show this way: piano, drums/,
  );
  const slashed = edit(
    withDrums,
    { type: "setMeasureStyle", measureId: "bar-2", style: "slashes", staffId: "drums" },
    "slash",
  );
  const styles = slashed.measures[1].voices.map((bar) => bar.style ?? "notes");
  assert.deepEqual(styles, ["notes", "slashes"]);
});
