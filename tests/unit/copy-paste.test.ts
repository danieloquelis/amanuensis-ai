import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFromSelection, cutEdit, pasteEdit } from "@/modules/editor";
import {
  applyCommand,
  barEvents,
  barStyle,
  createExample,
  numberedVoice,
  resolvePositions,
  scoreText,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `copy-${requests++}`, expectedRevision: score.revision, operation });
const write = (score: Score, text: string) => writeBars(score, text, `write-${requests++}`).score;
/** A bar's line of score text, without the bar number. */
const bar = (score: Score, n: number, voice = "") =>
  scoreText(score)
    .split("\n")
    .find((line) => line.startsWith(`bar ${n}${voice}:`) || line.startsWith(`bar ${n} (`))!
    .replace(/^bar \d+( \([^)]*\))?( v\d)?: /, "");
const ids = (score: Score, n: number) => barEvents(score.measures[n - 1]).map((e) => e.id);

test("copying bars writes them over the bars from the target on, with their chords and dynamics", () => {
  let score = edit(createExample(), { type: "putChord", measureId: "bar-1", beat: 0, symbol: "C" });
  score = edit(score, { type: "putAnnotation", targetId: "note-0-1", kind: "dynamic", text: "p" });
  const pasted = edit(score, { type: "copyBars", measureIds: ["bar-1", "bar-2"], toMeasureId: "bar-3" });
  assert.equal(bar(pasted, 3), bar(score, 1));
  assert.equal(bar(pasted, 4).split(" ; ")[0], bar(score, 2).split(" ; ")[0]);
  assert.equal(pasted.measures.length, 4);
  assert.ok(
    pasted.chords.some((c) => c.measureId === "bar-3"),
    "the chord came along",
  );
  assert.ok(
    pasted.annotations.some((a) => a.targetId === ids(pasted, 3)[1]),
    "so did the dynamic",
  );
});

test("copying bars past the end adds bars, and overlapping ranges copy what was there before", () => {
  const score = createExample();
  const longer = edit(score, { type: "copyBars", measureIds: ["bar-3", "bar-4"], toMeasureId: "bar-4" });
  assert.equal(longer.measures.length, 5);
  assert.equal(bar(longer, 4), bar(score, 3));
  assert.equal(bar(longer, 5), bar(score, 4));
  const shifted = edit(score, { type: "copyBars", measureIds: ["bar-1", "bar-2"], toMeasureId: "bar-2" });
  assert.equal(bar(shifted, 3), bar(score, 2), "bar 2 was read before it was overwritten");
});

test("copying bars copies every voice and a slash display", () => {
  let score = write(createExample(), "bar 1 v2: C3w");
  score = edit(score, { type: "setMeasureStyle", measureId: "bar-2", style: "slashes" });
  const pasted = edit(score, { type: "copyBars", measureIds: ["bar-1", "bar-2"], toMeasureId: "bar-3" });
  assert.equal(barEvents(pasted.measures[2], numberedVoice(pasted, 2)!).length, 1);
  assert.equal(barStyle(pasted.measures[3]), "slashes");
});

test("copying notes overwrites from the target on and keeps the rhythm", () => {
  const score = createExample();
  const [, second, third] = ids(score, 1);
  const pasted = edit(score, { type: "copyNotes", eventIds: [second, third], toEventId: ids(score, 2)[0] });
  const copied = bar(score, 1).split(" ").slice(1, 3).join(" ");
  assert.ok(bar(pasted, 2).startsWith(`${copied} `), `${bar(pasted, 2)} starts with ${copied}`);
  assert.equal(bar(pasted, 2).split(" ").at(-1), bar(score, 2).split(" ").at(-1), "the rest of the bar stays");
});

test("notes copied across a barline are split and tied, and a cut note leaves a rest", () => {
  let score = write(createExample(), "bar 1: C4h. D4q\nbar 2: E4w");
  const [, d] = ids(score, 1);
  const g = write(score, "bar 3: G4h A4h");
  score = g;
  // A half note pasted on beat 4 of bar 1 crosses into bar 2.
  const pasted = edit(score, { type: "copyNotes", eventIds: [ids(score, 3)[0]], toEventId: d });
  assert.equal(bar(pasted, 1), "C4h. G4q~");
  assert.match(bar(pasted, 2), /^G4q r/, "the rest of the whole note is silent");
});

test("only a run of one voice can be copied", () => {
  const score = createExample();
  const [first, , third] = ids(score, 1);
  assert.throws(
    () => edit(score, { type: "copyNotes", eventIds: [first, third], toEventId: ids(score, 2)[0] }),
    /consecutive/,
  );
});

test("the selection decides what is copied, and the clip carries score text", () => {
  const score = createExample();
  const bars = copyFromSelection(score, [
    { kind: "bar", id: "bar-2" },
    { kind: "bar", id: "bar-1" },
  ])!;
  assert.deepEqual(bars.ids, ["bar-1", "bar-2"], "in score order");
  assert.match(bars.text, /^bar 1: .*\nbar 2: /);
  const [first, , third] = ids(score, 1);
  const notes = copyFromSelection(score, [
    { kind: "event", id: third },
    { kind: "event", id: first },
  ])!;
  assert.equal(notes.ids.length, 3, "the run from the first picked note to the last");
  assert.equal(notes.text, bar(score, 1).split(" ").slice(0, 3).join(" "));
});

test("a paste lands at the selection: bars at a bar, notes at a note", () => {
  const score = createExample();
  const clip = copyFromSelection(score, [{ kind: "bar", id: "bar-1" }])!;
  const atBar = pasteEdit(score, clip, [{ kind: "bar", id: "bar-3" }], "p1");
  assert.deepEqual(atBar.operation, { type: "copyBars", measureIds: ["bar-1"], toMeasureId: "bar-3" });
  const atNote = pasteEdit(score, clip, [{ kind: "event", id: ids(score, 4)[0] }], "p2");
  assert.deepEqual(atNote.operation, { type: "copyBars", measureIds: ["bar-1"], toMeasureId: "bar-4" });
  assert.throws(() => pasteEdit(score, clip, [], "p3"), /Select a bar or a note/);
});

test("bars copied from another score are pasted from their score text", () => {
  const other = write(createExample(), "bar 1: G4h E4h ; chords C");
  const clip = copyFromSelection(other, [{ kind: "bar", id: "bar-1" }])!;
  const fresh = edit(createExample(), { type: "newScore", bars: 2 });
  const { operation } = pasteEdit(fresh, clip, [{ kind: "bar", id: fresh.measures[1].id }], "text-paste");
  const pasted = applyCommand(fresh, { requestId: "text-paste", expectedRevision: fresh.revision, operation });
  assert.equal(bar(pasted, 2), "G4h E4h ; chords C");
});

test("cutting clears the copied bars, or turns the copied notes into rests", () => {
  const score = createExample();
  const clip = copyFromSelection(score, [{ kind: "event", id: ids(score, 1)[0] }])!;
  const cut = edit(score, cutEdit(clip).operation);
  assert.equal(barEvents(cut.measures[0])[0].pitch, null);
});

test("pasting onto what was copied carries on right after it, and after the last paste", () => {
  const score = createExample();
  const [c] = ids(score, 1);
  const clip = copyFromSelection(score, [{ kind: "event", id: c }])!;
  const first = pasteEdit(score, clip, [{ kind: "event", id: c }], "f1");
  const once = applyCommand(score, { requestId: "f1", expectedRevision: score.revision, operation: first.operation });
  const pastedRefs = first.pasted(once);
  assert.equal(pastedRefs.length, 1);
  assert.equal(barEvents(once.measures[0])[1].id, pastedRefs[0].id, "the copy follows the note");
  assert.equal(barEvents(once.measures[0])[1].pitch?.step, "C");
  const second = pasteEdit(
    once,
    clip,
    pastedRefs,
    "f2",
    pastedRefs.map((r) => r.id),
  );
  const twice = applyCommand(once, { requestId: "f2", expectedRevision: once.revision, operation: second.operation });
  assert.deepEqual(
    barEvents(twice.measures[0])
      .slice(0, 3)
      .map((e) => e.pitch?.step),
    ["C", "C", "C"],
  );
});

test("a bar pasted onto itself goes after it, adding a bar at the end of the score", () => {
  const score = createExample();
  const clip = copyFromSelection(score, [{ kind: "bar", id: "bar-4" }])!;
  const edit = pasteEdit(score, clip, [{ kind: "bar", id: "bar-4" }], "end");
  const pasted = applyCommand(score, { requestId: "end", expectedRevision: score.revision, operation: edit.operation });
  assert.equal(pasted.measures.length, 5);
  assert.equal(bar(pasted, 5), bar(score, 4));
  assert.deepEqual(edit.pasted(pasted), [{ kind: "bar", id: pasted.measures[4].id }]);
});

test("a copied motif is developed on the way: moved in the key, inverted, backwards, augmented", () => {
  const score = edit(createExample(), { type: "setKey", key: { fifths: 0, mode: "major" } });
  const motif = ids(score, 1);
  const develop = (extra: Partial<Extract<Operation, { type: "copyNotes" }>>) =>
    bar(edit(score, { type: "copyNotes", eventIds: motif, toEventId: ids(score, 3)[0], ...extra }), 3);
  // C E G E, a fifth up in C major: G B D E→B.
  assert.equal(develop({ steps: 4 }), "G4q B4q D5q B4q");
  // Mirrored around its first note: C A3 F3 A3.
  assert.equal(develop({ invert: true }), "C4q A3q F3q A3q");
  assert.equal(develop({ retrograde: true }), "E4q G4q E4q C4q");
  // Twice as slow: two bars of half notes.
  const slow = edit(score, { type: "copyNotes", eventIds: motif, toEventId: ids(score, 3)[0], factor: 2 });
  assert.equal(bar(slow, 3), "C4h E4h");
  assert.equal(bar(slow, 4), "G4h E4h");
});

test("a copy can start inside a rest, and a raised leading tone stays raised when it moves", () => {
  let score = edit(createExample(), { type: "setKey", key: { fifths: -1, mode: "minor" } });
  score = write(score, "bar 1: D4q E4q F4q C#4q\nbar 3: rw");
  const answer = edit(score, {
    type: "copyNotes",
    eventIds: ids(score, 1),
    toEventId: ids(score, 3)[0],
    offset: 2,
    steps: 4,
  });
  // Up a fifth in D minor, from beat 3: A B♭ C G♯ (the C♯ becomes G♯, not G).
  assert.equal(bar(answer, 3), "rh A4q Bb4q");
  assert.equal(bar(answer, 4).split(" ")[0], "C5q");
  assert.match(bar(answer, 4), /G#4q/);
});

test("bars copied by number to the bar after the last are added at the end", () => {
  const score = createExample();
  const raw = { type: "copyBars", measureIds: ["1", "2"], toMeasureId: "5" };
  const operation = resolvePositions(score, raw) as Operation;
  const longer = edit(score, operation);
  assert.equal(longer.measures.length, 6);
  assert.equal(bar(longer, 5), bar(score, 1));
  assert.equal(bar(longer, 6), bar(score, 2));
  // A bar number inside the score is that bar, as everywhere else.
  const over = edit(score, resolvePositions(score, { ...raw, toMeasureId: "3" }) as Operation);
  assert.equal(bar(over, 3), bar(score, 1));
});
