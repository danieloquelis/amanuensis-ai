import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCommand,
  createExample,
  parseBarsText,
  parseScore,
  positionOf,
  resolvePositions,
  scoreText,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";
import { createPlaybackPlan } from "@/modules/playback";

const fixture = (name: string) => parseScore(JSON.parse(readFileSync(`tests/fixtures/engraving/${name}.json`, "utf8")));
const barLines = (text: string) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("bar "))
    .join("\n");

test("score text reads a bar per line: notes, ties, slurs and chords", () => {
  const text = scoreText(createExample());
  assert.match(text, /^revision 0; title "First light"; key C major; tempo 88; meter 4\/4$/m);
  assert.match(text, /^bar 2: D4q F4e G4e A4h$/m);
});

/** What is heard: each sounding note's start, pitch and written length, followed through its ties. */
function heard(score: Score): string[] {
  const events = createPlaybackPlan(score).events;
  const byId = new Map(events.map((e) => [e.id, e]));
  const length = (id: string | undefined): number => {
    const event = id ? byId.get(id) : undefined;
    return event ? event.beats + length(event.tiedTo) : 0;
  };
  return events
    .filter((e) => e.notes.length)
    .map((e) => `${e.start.toFixed(3)} ${e.notes.join(" ")} ${e.beats + length(e.tiedTo)}`);
}

test("writing back what was read changes nothing musical", () => {
  for (const name of ["long", "slurs", "ties", "keys"]) {
    const score = fixture(name);
    const written = writeBars(score, barLines(scoreText(score)), "rt").score;
    assert.deepEqual(heard(written), heard(score), name);
  }
  // Already written as a musician would, they come back exactly; ties a single value can say do not.
  assert.equal(
    barLines(scoreText(writeBars(fixture("long"), barLines(scoreText(fixture("long"))), "rt").score)),
    barLines(scoreText(fixture("long"))),
  );
  assert.match(
    scoreText(writeBars(fixture("ties"), barLines(scoreText(fixture("ties"))), "rt").score),
    /^bar 1: G4q C5h E4q~$/m,
  );
});

test("written bars replace notes and chords; bars past the end are added", () => {
  const score = createExample();
  const { score: written, command } = writeBars(
    score,
    "bar 2: D4q (F4e G4e A4h ; chords Dm7 G7@3\nbar 5: A4q) G4q!staccato rh",
    "w",
  );
  assert.equal(written.measures.length, 5);
  assert.equal(scoreText(written).split("\n")[2], "bar 2: D4q (F4e G4e A4h ; chords Dm7 G7@3");
  assert.equal(scoreText(written).split("\n")[5], "bar 5: A4q) G4q!staccato rh");
  assert.equal(command.operation.type, "batch", "one undoable edit");
});

test("a malformed line or a bar that does not add up is refused with a readable reason", () => {
  const score = createExample();
  assert.throws(() => writeBars(score, "bar 1: C4q E4x", "w"), /"E4x" is not a note or rest/);
  assert.throws(() => writeBars(score, "the first bar: C4w", "w"), /not a bar line/);
  assert.throws(() => writeBars(score, "bar 33: C4w", "w"), /at most 32 bars: bar 33 is past its end/);
  // Every line that doesn't fill its bar is named at once.
  assert.throws(
    () => writeBars(score, "bar 1: C4q E4q\nbar 2: C4w\nbar 3: C4h.", "w"),
    /bar 1 has 2 of 4 \(4\/4\); bar 3 has 3 of 4/,
  );
});

test("operations can name notes by bar and beat, and bars by number", () => {
  const score = createExample();
  const resolved = resolvePositions(score, {
    type: "batch",
    operations: [
      { type: "setArticulation", eventId: "2:2.5", articulation: "accent" },
      { type: "putSlur", startEventId: "1:1", endEventId: "1:4" },
      { type: "transpose", eventIds: ["3:1", "3:2"], steps: 7 },
      { type: "putChord", measureId: "2", beat: 0, symbol: "Dm" },
      { type: "setMeter", measureIds: [4], meter: { numerator: 3, denominator: 4 }, policy: "auto" },
    ],
  });
  assert.deepEqual(
    resolved.operations.map((op) => Object.values(op).filter((v) => typeof v === "string" || Array.isArray(v))),
    [
      ["setArticulation", "note-1-2", "accent"],
      ["putSlur", "note-0-0", "note-0-3"],
      ["transpose", ["note-2-0", "note-2-1"]],
      ["putChord", "bar-2", "Dm"],
      ["setMeter", ["bar-4"], "auto"],
    ],
  );
  assert.equal(resolvePositions(score, { eventId: "note-0-0" }).eventId, "note-0-0");
  assert.equal(resolvePositions(score, { eventId: "2#4" }).eventId, "note-1-3");
  assert.throws(() => resolvePositions(score, { eventId: "2#5" }), /no note or rest number 5/);
  assert.throws(() => resolvePositions(score, { eventId: "2:1.25" }), /No note or rest starts at bar 2, beat 1.25/);
});

test("chords, slurs, marks, repeats and indications are named by where they are", () => {
  let score = createExample();
  const edit = (operation: Operation) =>
    (score = applyCommand(score, { requestId: `n${score.revision}`, expectedRevision: score.revision, operation }));
  edit({
    type: "batch",
    operations: [
      { type: "putChord", measureId: "bar-2", beat: 2, symbol: "Am7" },
      { type: "putSlur", startEventId: "note-0-1", endEventId: "note-0-3" },
      { type: "putMark", measureId: "bar-4", kind: "fine" },
      { type: "putRepeat", startMeasureId: "bar-1", endMeasureId: "bar-2", count: 2 },
      { type: "putAnnotation", targetId: "note-1-2", kind: "dynamic", text: "mf" },
      { type: "putAnnotation", targetId: "bar-3", kind: "text", text: "dolce" },
    ],
  });
  const items = [...score.chords, ...score.slurs, ...score.marks, ...score.repeats, ...score.annotations];
  const names = items.map((item) => positionOf(score, item.id));
  assert.deepEqual(names, ["chord 2:3", "slur 1#2", "mark 4 fine", "repeat 1", "dynamic 2:2.5", "text 3:1"]);
  for (const [index, name] of names.entries()) {
    assert.equal(resolvePositions(score, { id: name }).id, items[index].id, name);
  }
});

test("written bars are spelled as a musician would: a hidden beat becomes a tie, marks stay on the note", () => {
  const { score } = writeBars(createExample(), "bar 2: (C4e!accent D4h E4q.)", "spell");
  assert.match(scoreText(score), /^bar 2: \(C4e!accent D4q\.~ D4e E4q\.\)$/m);
});

test("slips that can only mean one thing are read as meant: a natural, a drum without brackets, a trailing comma", () => {
  const [bar] = parseBarsText("bar 1: Fn4e kickq hatopene, G4q, ; chords Gm7, C7@3");
  assert.deepEqual(
    bar.events!.map((event) =>
      event.drums.length ? event.drums.join("+") : `${event.pitch?.step}${event.pitch?.alter}`,
    ),
    ["F0", "kick", "hatopen", "G0"],
  );
  assert.deepEqual(bar.chords, [
    { symbol: "Gm7", beat: 0 },
    { symbol: "C7", beat: 2 },
  ]);
});
