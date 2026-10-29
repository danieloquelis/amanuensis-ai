import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
  createExample,
  parseChordSymbol,
  parseScore,
  type MarkKind,
  type Operation,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { expectedRevision: score.revision, requestId: `lead-${requests++}`, operation });
const chord = (score: Score, measureId: string, beat: number, symbol: string) =>
  edit(score, { type: "putChord", measureId, beat, symbol });
const mark = (score: Score, measureId: string, kind: MarkKind) => edit(score, { type: "putMark", measureId, kind });
/** Bars in the order playback visits them, read from the melody events. */
const playedBars = (score: Score) => {
  const plan = createPlaybackPlan(score);
  const firstEvents = new Set(score.measures.map((m) => m.events[0].id));
  return plan.events.filter((e) => firstEvents.has(e.id)).map((e) => Math.floor(e.beat / 4) + 1);
};

test("chord symbols accept common spellings and store root, quality and bass", () => {
  assert.deepEqual(parseChordSymbol("Bb7/D"), {
    root: { step: "B", alter: -1 },
    quality: "7",
    bass: { step: "D", alter: 0 },
  });
  assert.equal(parseChordSymbol("C∆7")?.quality, "maj7");
  assert.equal(parseChordSymbol("F#ø")?.quality, "m7b5");
  assert.equal(parseChordSymbol("A-7")?.quality, "m7");
  assert.equal(parseChordSymbol("C6/9")?.quality, "6/9");
  assert.equal(parseChordSymbol("H7"), null);
});

test("a chord on a beat that already has one replaces it", () => {
  let score = chord(createExample(), "bar-1", 0, "C");
  score = chord(score, "bar-1", 0, "Am");
  assert.equal(score.chords.length, 1);
  assert.equal(score.chords[0].quality, "m");
});

test("an unreadable chord symbol is rejected with examples", () => {
  assert.throws(() => chord(createExample(), "bar-1", 0, "Cfoo"), /not a chord symbol I can read. Try C/);
});

test("a chord must start inside its bar", () => {
  assert.throws(() => chord(createExample(), "bar-1", 4, "C"), /inside its bar/);
});

test("a slash bar replaces the notes but keeps the bar's chords", () => {
  const withChord = chord(createExample(), "bar-2", 0, "Dm7");
  const slashed = edit(withChord, { type: "setMeasureStyle", measureId: "bar-2", style: "slashes" });
  assert.equal(slashed.measures[1].style, "slashes");
  assert.equal(slashed.measures[1].events.length, 1);
  assert.equal(slashed.chords.length, 1);
});

test("writing a note into a slash bar turns it back into a normal bar", () => {
  const slashed = edit(createExample(), { type: "setMeasureStyle", measureId: "bar-2", style: "slashes" });
  const restId = slashed.measures[1].events[0].id;
  const pitch = { step: "A", octave: 4, alter: 0 } as const;
  const noted = edit(slashed, {
    type: "batch",
    operations: [
      { type: "setDuration", eventId: restId, duration: 1 },
      { type: "setPitch", eventId: restId, pitch },
    ],
  });
  assert.equal(noted.measures[1].style, undefined);
});

test("the first bar cannot be a repeat (%) bar", () => {
  assert.throws(
    () => edit(createExample(), { type: "setMeasureStyle", measureId: "bar-1", style: "repeat" }),
    /nothing to repeat/,
  );
});

test("a bar can carry several marks, and a score several of each", () => {
  let score = mark(createExample(), "bar-2", "segno");
  score = mark(score, "bar-2", "coda");
  score = mark(score, "bar-4", "fine");
  score = mark(score, "bar-4", "dsAlFine");
  score = mark(score, "bar-3", "coda");
  assert.equal(score.marks.length, 5);
  assert.deepEqual(
    score.marks.filter((m) => m.measureId === "bar-2").map((m) => m.kind),
    ["segno", "coda"],
  );
});

test("adding the same mark to the same bar twice keeps one", () => {
  const score = mark(mark(createExample(), "bar-1", "segno"), "bar-1", "segno");
  assert.equal(score.marks.length, 1);
});

test("a mark is removed by its ID", () => {
  const score = mark(createExample(), "bar-1", "segno");
  assert.equal(edit(score, { type: "removeNotation", id: score.marks[0].id }).marks.length, 0);
});

test("duplicating a bar copies its chords but not its section or marks", () => {
  let score = chord(createExample(), "bar-1", 0, "C");
  score = edit(score, { type: "setSection", measureId: "bar-1", label: "A" });
  score = edit(score, { type: "duplicateMeasure", measureId: "bar-1" });
  assert.equal(score.chords.length, 2);
  assert.equal(score.measures[1].section, undefined);
});

test("deleting a bar removes its chords", () => {
  const score = edit(chord(createExample(), "bar-2", 0, "G7"), { type: "deleteMeasure", measureId: "bar-2" });
  assert.equal(score.chords.length, 0);
});

test("an indication can be moved freely and reset", () => {
  const base = edit(createExample(), { type: "putAnnotation", targetId: "bar-1", kind: "text", text: "dolce" });
  const id = base.annotations[0].id;
  const moved = edit(base, { type: "moveAnnotation", id, offset: { x: 40, y: -12 } });
  assert.deepEqual(moved.annotations[0].offset, { x: 40, y: -12 });
  assert.equal(edit(moved, { type: "moveAnnotation", id, offset: null }).annotations[0].offset, undefined);
});

test("files from before chord symbols open with an empty chord list", () => {
  const legacy = JSON.parse(JSON.stringify(createExample()));
  delete legacy.chords;
  assert.deepEqual(parseScore(legacy).chords, []);
});

test("D.S. returns to the nearest segno before it", () => {
  let score = edit(createExample(), { type: "appendMeasure" });
  score = mark(score, "bar-1", "segno");
  score = mark(score, "bar-3", "segno");
  score = mark(score, "bar-4", "ds");
  assert.deepEqual(playedBars(score), [1, 2, 3, 4, 3, 4, 5]);
});

test("D.C. al Fine plays from the start and stops at Fine", () => {
  let score = mark(createExample(), "bar-2", "fine");
  score = mark(score, "bar-4", "dcAlFine");
  assert.deepEqual(playedBars(score), [1, 2, 3, 4, 1, 2]);
});

test("D.S. al Coda jumps to the segno, then from To Coda to the coda", () => {
  let score = edit(createExample(), { type: "appendMeasure" });
  score = mark(score, "bar-2", "segno");
  score = mark(score, "bar-3", "toCoda");
  score = mark(score, "bar-4", "dsAlCoda");
  score = mark(score, score.measures[4].id, "coda");
  assert.deepEqual(playedBars(score), [1, 2, 3, 4, 2, 3, 5]);
});

test("repeats are not taken again after a D.C. jump", () => {
  let score = edit(createExample(), {
    type: "putRepeat",
    startMeasureId: "bar-1",
    endMeasureId: "bar-2",
    count: 2,
  });
  score = mark(score, "bar-3", "dc");
  assert.deepEqual(playedBars(score), [1, 2, 1, 2, 3, 1, 2, 3, 4]);
});

test("a repeat (%) bar plays the previous bar's notes in its own place", () => {
  const score = edit(createExample(), { type: "setMeasureStyle", measureId: "bar-3", style: "repeat" });
  const plan = createPlaybackPlan(score);
  const bar3 = plan.events.filter((e) => e.beat >= 8 && e.beat < 12);
  assert.deepEqual(
    bar3.map((e) => e.notes),
    plan.events.filter((e) => e.beat >= 4 && e.beat < 8).map((e) => e.notes),
  );
});

test("a chord sounds until the next chord, across bars", () => {
  let score = chord(createExample(), "bar-1", 0, "C");
  score = chord(score, "bar-2", 2, "G7");
  const sounds = createPlaybackPlan(score).chords;
  // C fills bar 1 and the first half of bar 2; G7 the rest of bar 2 and bars 3–4.
  assert.deepEqual(
    sounds.map((s) => s.notes.length),
    [4, 4, 5, 5, 5],
  );
  const secondsPerBeat = 60 / score.tempo;
  assert.ok(Math.abs(sounds[1].duration - 2 * secondsPerBeat) < 1e-9);
});
