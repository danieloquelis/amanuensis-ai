import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { typedLetterEdit } from "@/modules/editor";
import { layoutScore } from "@/modules/engraving";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
  barEvents,
  createExample,
  eventPitches,
  parseScore,
  pitchName,
  scoreText,
  writeBars,
  type Operation,
  type Pitch,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `stack-${requests++}`, expectedRevision: score.revision, operation });
const write = (score: Score, text: string) => writeBars(score, text, `write-${requests++}`).score;
const p = (name: string): Pitch => {
  const [, step, accidental, octave] = /^([A-G])([#b]?)(\d)$/.exec(name)!;
  return {
    step: step as Pitch["step"],
    alter: accidental === "#" ? 1 : accidental === "b" ? -1 : 0,
    octave: Number(octave),
  };
};
const idAt = (score: Score, bar: number, index: number) => barEvents(score.measures[bar - 1])[index].id;
const notes = (score: Score, bar: number, index: number) =>
  eventPitches(barEvents(score.measures[bar - 1])[index])
    .map(pitchName)
    .join(" ");

test("several notes on one stem are stored lowest first, the lowest as the pitch", () => {
  const score = edit(createExample(), { type: "setNotes", eventId: "note-0-0", pitches: [p("G4"), p("C4"), p("E4")] });
  const [first] = barEvents(score.measures[0]);
  assert.equal(pitchName(first.pitch), "C4");
  assert.deepEqual(first.stack!.map(pitchName), ["E4", "G4"]);
  const one = edit(score, { type: "setNotes", eventId: "note-0-0", pitches: [p("D4")] });
  assert.equal(barEvents(one.measures[0])[0].stack, undefined, "one pitch is a plain note");
  assert.throws(
    () => edit(createExample(), { type: "setNotes", eventId: "note-0-0", pitches: [p("C4"), p("C4")] }),
    /twice/,
  );
});

test("a stored stack must rise above its pitch, and a rest holds none", () => {
  const broken = structuredClone(createExample());
  broken.measures[0].voices[0].events[0].stack = [p("C3")];
  assert.throws(() => parseScore(broken), /rise/);
  const rest = structuredClone(createExample());
  Object.assign(rest.measures[0].voices[0].events[0], { pitch: null, stack: [p("E4")] });
  assert.throws(() => parseScore(rest), /rest/);
});

test("a chord moves as a whole: setPitch, transpose, and a rest drops it", () => {
  let score = write(createExample(), "bar 1: <C4 E4 G4>q D4q E4q F4q");
  score = edit(score, { type: "setPitch", eventId: idAt(score, 1, 0), pitch: p("D4") });
  assert.equal(notes(score, 1, 0), "D4 F4 A4");
  score = edit(score, { type: "transpose", eventIds: [idAt(score, 1, 0)], steps: 7 });
  assert.equal(notes(score, 1, 0), "D5 F5 A5");
  score = edit(score, { type: "removeEvent", eventId: idAt(score, 1, 0) });
  assert.equal(barEvents(score.measures[0])[0].stack, undefined);
});

test("a tie holds the notes the next chord repeats, and goes when none are shared", () => {
  let score = write(createExample(), "bar 1: <C4 E4 G4>h~ <E4 G4 B4>h\nbar 2: <F4 A4>w");
  assert.equal(barEvents(score.measures[0])[0].tie, true, "E4 and G4 are held");
  const held = createPlaybackPlan(score).events[1];
  assert.deepEqual(held.notes, [], "the held chord does not strike again");
  score = edit(score, { type: "setNotes", eventId: idAt(score, 1, 1), pitches: [p("D4"), p("F4")] });
  assert.equal(barEvents(score.measures[0])[0].tie, undefined, "nothing in common: the tie goes");
  const tied = edit(createExample(), { type: "setNotes", eventId: "note-0-3", pitches: [p("C4"), p("E4")] });
  const forward = edit(tied, { type: "setTie", eventId: "note-0-3", tied: true });
  assert.equal(notes(forward, 2, 0), "C4 E4", "a tie carries the whole chord forward");
});

test("score text writes chords as <…> and reads them back the same", () => {
  const score = write(createExample(), "bar 1: <C4 E4 G4>q (<D4 F#4>q <E4 G#4>h)");
  const text = scoreText(score);
  assert.match(text, /^bar 1: <C4 E4 G4>q \(<D4 F#4>q <E4 G#4>h\)$/m);
  const again = write(
    score,
    text
      .split("\n")
      .filter((l) => l.startsWith("bar "))
      .join("\n"),
  );
  assert.equal(scoreText(again).replace(/revision \d+/, ""), text.replace(/revision \d+/, ""));
  assert.throws(() => write(createExample(), "bar 1: <C4 X9>w"), /not a note/);
});

test("playback sounds every note of a chord", () => {
  const score = write(createExample(), "bar 1: <C4 E4 G4>w");
  assert.deepEqual(createPlaybackPlan(score).events[0].notes, [60, 64, 67]);
});

test("Shift + a letter adds that note above the chord's top note", () => {
  const score = createExample();
  const op = typedLetterEdit(score, "note-0-0", "E", true)!.operation as { pitches: Pitch[] };
  assert.deepEqual(op.pitches.map(pitchName), ["C4", "E4"]);
  const higher = edit(score, op as Operation);
  const again = typedLetterEdit(higher, "note-0-0", "C", true)!.operation as { pitches: Pitch[] };
  assert.deepEqual(again.pitches.map(pitchName), ["C4", "E4", "C5"]);
});

test("the chords fixture engraves cleanly: one stem through every head, seconds across it, accidentals apart", () => {
  const score = parseScore(JSON.parse(readFileSync("tests/fixtures/engraving/stacks.json", "utf8")));
  const chords = layoutScore(score)
    .systems.flatMap((s) => s.events)
    .filter((e) => e.heads);
  assert.ok(chords.length >= 10);
  for (const chord of chords) {
    const ys = chord.heads!.map((h) => h.y);
    const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
    assert.equal(chord.chordTop, top);
    if (chord.stemDown) assert.ok(chord.stemEnd > bottom, `${chord.event.id}: down-stem below the lowest head`);
    else assert.ok(chord.stemEnd < top, `${chord.event.id}: up-stem above the highest head`);
    const sorted = [...chord.heads!].sort((a, b) => a.y - b.y);
    sorted.slice(1).forEach((head, i) => {
      if (Math.abs(head.y - sorted[i].y) < 7)
        assert.notEqual(head.dx, sorted[i].dx, `${chord.event.id}: a second sits across the stem`);
    });
    const accidentals = chord.heads!.filter((h) => h.accidental !== null);
    for (const a of accidentals)
      for (const b of accidentals)
        if (a !== b && Math.abs(a.y - b.y) < 36)
          assert.notEqual(a.accidentalShift, b.accidentalShift, "accidentals apart");
  }
});
