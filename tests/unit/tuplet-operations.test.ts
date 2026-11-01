import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCommand,
  barEvents,
  createExample,
  parseScore,
  resolvePositions,
  scoreText,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";
import { tripletEdit } from "@/modules/editor";

const fixture = (): Score => parseScore(JSON.parse(readFileSync("tests/fixtures/engraving/tuplets.json", "utf8")));
let requests = 0;
const run = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `r${requests++}`, expectedRevision: score.revision, operation });
/** A bar as score text, without its "bar N:" label. */
const bar = (score: Score, number: number) =>
  scoreText(score)
    .split("\n")
    .find((line) => line.startsWith(`bar ${number}:`))!
    .replace(/^bar \d+: /, "")
    .split(" ; ")[0];

test("makeTuplet splits a quarter into three triplet eighths, and removeTuplet undoes it exactly", () => {
  const score = createExample();
  const first = barEvents(score.measures[0])[0];
  const made = run(score, { type: "makeTuplet", eventId: first.id });
  assert.equal(bar(made, 1), "3[C4e re re] E4q G4q E4q");
  const undone = run(made, { type: "removeTuplet", eventId: barEvents(made.measures[0])[2].id });
  assert.deepEqual(undone.measures, score.measures);
});

test("makeTuplet refuses what cannot be a triplet, saying why", () => {
  const score = fixture();
  const triplet = barEvents(score.measures[0])[0];
  assert.throws(() => run(score, { type: "makeTuplet", eventId: triplet.id }), /already in a triplet/);
  const example = createExample();
  // The last bar of the example is a whole note: a triplet of halves would not fit the time of two.
  const whole = barEvents(example.measures[3])[0];
  assert.throws(() => run(example, { type: "makeTuplet", eventId: whole.id }), /eighth, a quarter or a half/);
  const compound = run(example, {
    type: "setMeter",
    measureIds: [example.measures[0].id],
    meter: { numerator: 12, denominator: 8 },
    policy: "preserve",
  });
  const inTwelveEight = barEvents(compound.measures[0])[0];
  assert.throws(() => run(compound, { type: "makeTuplet", eventId: inTwelveEight.id }), /simple meters/);
});

test("inside a triplet, durations change within it and the triplet keeps its length", () => {
  const made = run(createExample(), { type: "makeTuplet", eventId: barEvents(createExample().measures[0])[0].id });
  const first = barEvents(made.measures[0])[0];
  const grown = run(made, { type: "setDuration", eventId: first.id, duration: 1 });
  assert.equal(bar(grown, 1), "3[C4q re] E4q G4q E4q");
  assert.throws(
    () => run(grown, { type: "setDuration", eventId: first.id, duration: 2 }),
    /only grow into the triplet's rests/,
  );
  const shrunk = run(grown, { type: "setDuration", eventId: first.id, duration: 0.5 });
  assert.equal(bar(shrunk, 1), "3[C4e re re] E4q G4q E4q");
});

test("a note before a triplet never grows into the triplet's rests", () => {
  const score = writeBars(createExample(), "bar 1: C4q 3[re re re] G4h", "w").score;
  const quarter = barEvents(score.measures[0])[0];
  assert.throws(() => run(score, { type: "setDuration", eventId: quarter.id, duration: 2 }), /Make space first/);
});

test("copied bars keep their triplets under fresh IDs", () => {
  const score = fixture();
  const duplicated = run(score, { type: "duplicateMeasure", measureId: score.measures[0].id });
  assert.equal(bar(duplicated, 2), bar(score, 1));
  const copied = run(score, {
    type: "copyBars",
    measureIds: [score.measures[0].id],
    toMeasureId: score.measures[2].id,
  });
  assert.equal(bar(copied, 3), bar(score, 1));
});

test("halving the meter turns eighth triplets into sixteenth triplets; compound meters are refused", () => {
  const score = writeBars(createExample(), "bar 1: 3[C4e D4e E4e] F4q G4h", "w").score;
  const halved = run(score, {
    type: "setMeter",
    measureIds: [score.measures[0].id],
    meter: { numerator: 2, denominator: 4 },
    policy: "scale",
  });
  assert.equal(bar(halved, 1), "3[C4s D4s E4s] F4e G4q");
  assert.throws(
    () =>
      run(score, {
        type: "setMeter",
        measureIds: [score.measures[0].id],
        meter: { numerator: 12, denominator: 8 },
        policy: "auto",
      }),
    /simple meters|cut notes/,
  );
});

test("score text round-trips triplets: what the agent reads is what it writes", () => {
  const score = fixture();
  const lines = scoreText(score)
    .split("\n")
    .filter((line) => line.startsWith("bar "));
  const rewritten = writeBars(score, lines.join("\n"), "round").score;
  assert.deepEqual(
    scoreText(rewritten)
      .split("\n")
      .filter((line) => line.startsWith("bar ")),
    lines,
  );
  assert.match(lines[0], /^bar 1: 3\[C5e D5e E5e\] F4q 3\[G4q A4q B4q\]/);
});

test("written triplets are checked: unclosed, nested and short groups are refused", () => {
  const example = createExample();
  assert.throws(() => writeBars(example, "bar 1: 3[C4e D4e E4e F4q G4h", "w"), /never closed/);
  assert.throws(() => writeBars(example, "bar 1: 3[C4e 3[D4e E4e]] F4q G4h", "w"), /inside another/);
  assert.throws(() => writeBars(example, "bar 1: 3[C4e D4e] F4q G4h re", "w"), /fill its bar|time of two/);
});

test("triplet notes are found by order and by their beat in thirds", () => {
  const score = fixture();
  const [, second] = barEvents(score.measures[0]);
  assert.deepEqual(resolvePositions(score, { eventId: "1#2" }), { eventId: second.id });
  assert.deepEqual(resolvePositions(score, { eventId: "1:1.33" }), { eventId: second.id });
});

test("the editor's Triplet button makes a triplet of a plain value, and undoes it on a triplet's note", () => {
  const score = fixture();
  const [member, , , plain] = barEvents(score.measures[0]);
  assert.deepEqual(tripletEdit(plain).operation, { type: "makeTuplet", eventId: plain.id });
  assert.equal(tripletEdit(plain).receipt, "Made triplet");
  assert.deepEqual(tripletEdit(member).operation, { type: "removeTuplet", eventId: member.id });
  assert.equal(tripletEdit(member).receipt, "Removed triplet");
});
