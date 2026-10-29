import { test } from "node:test";
import assert from "node:assert/strict";
import { describeReadability, readability, spellRhythm, type Meter } from "@/modules/score";
import { toBars } from "@/modules/voice";

const NAMES: Record<number, string> = { 4: "w", 3: "h.", 2: "h", 1.5: "q.", 1: "q", 0.75: "e.", 0.5: "e", 0.25: "s" };
const FOUR: Meter = { numerator: 4, denominator: 4 };

/** A bar's rhythm as written: lengths in beats (a string is a rest), tied parts joined by "~". */
function written(rhythm: (number | string)[], meter: Meter = FOUR): string {
  let at = 0;
  return rhythm
    .map((value) => {
      const rest = typeof value === "string";
      const length = Number(value);
      const parts = spellRhythm(at, length, meter, rest).map((p) => (rest ? "r" : "") + NAMES[p]);
      at += length;
      return parts.join(rest ? " " : "~");
    })
    .join(" ");
}

test("a value that hides the middle of the bar or a beat is tied where the beat shows", () => {
  assert.equal(written([0.5, 2, 1.5]), "e q.~e q.");
  assert.equal(written([0.5, 0.5, 2.5, 0.5]), "e e q~q. e");
  assert.equal(written([0.5, 3.5]), "e q.~h");
});

test("familiar syncopations are written as musicians read them, not split", () => {
  for (const [rhythm, expected] of [
    [[1, 1.5, 0.5, 1], "q q. e q"],
    [[0.5, 1, 1, 1, 0.5], "e q q q e"],
    [[1, 2, 1], "q h q"],
    [[1.5, 1.5, 1], "q. q. q"],
    [[0.5, 1.5, 2], "e q. h"],
    [[0.75, 0.25, 0.75, 0.25, 2], "e. s e. s h"],
  ] as const) {
    assert.equal(written([...rhythm]), expected);
  }
});

test("rests show every beat they cover, and never the middle of the bar", () => {
  assert.equal(written([1, "2", 1]), "q rq rq q");
  assert.equal(written(["3", 1]), "rh rq q");
  assert.equal(written(["4"]), "rw");
  assert.equal(written([1, "2"], { numerator: 3, denominator: 4 }), "q rq rq");
});

test("compound meters show their dotted-quarter beats", () => {
  const sixEight: Meter = { numerator: 6, denominator: 8 };
  assert.equal(written([1, 0.5, 1.5], sixEight), "q e q.");
  assert.equal(written([1, 1, 1], sixEight), "q e~e q");
});

test("sung notes are laid into bars the same way", () => {
  const placed = [0.5, 2, 1.5].reduce<{ midi: number; start: number; beats: number }[]>(
    (notes, beats) => [...notes, { midi: 60, start: notes.reduce((t, n) => t + n.beats, 0), beats }],
    [],
  );
  const [bar] = toBars(placed, FOUR);
  assert.deepEqual(
    bar.map((e) => [e.beats, Boolean(e.tie)]),
    [
      [0.5, false],
      [1.5, true],
      [0.5, false],
      [1.5, false],
    ],
  );
});

test("how plainly a passage reads: sixteenths, ties inside a bar and sixteenth starts are counted", () => {
  const note = (duration: number, tie = false) => ({ pitch: "C4", duration, tie });
  const plain = [[note(1), note(0.5), note(0.5), note(2)]];
  const busy = [[note(0.25), note(0.5), note(0.25, true), note(0.25), note(0.75), note(2)]];
  assert.equal(describeReadability(readability(plain, FOUR)), "4 notes, all eighths or longer, no ties inside bars");
  assert.equal(
    describeReadability(readability(busy, FOUR)),
    "6 notes, 3 sixteenths, 1 tie inside a bar, 3 starting on a sixteenth",
  );
});
