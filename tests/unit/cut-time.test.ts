import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutScore } from "@/modules/engraving";
import {
  groovesFor,
  grooveBar,
  parseScore,
  scoreText,
  tempoMarking,
  writeBars,
  type Meter,
  type Score,
} from "@/modules/score";

// Cut time (2/2, alla breve): four quarter beats felt in two half-note beats.
const CUT: Meter = { numerator: 2, denominator: 2 };
const COMMON: Meter = { numerator: 4, denominator: 4 };
const cutTime = () => parseScore(JSON.parse(readFileSync("tests/fixtures/engraving/cut-time.json", "utf8")));
const inMeter = (score: Score, meter: Meter): Score =>
  parseScore({ ...score, measures: score.measures.map((measure) => ({ ...measure, meter })) });
const beamCount = (score: Score) => layoutScore(score).systems.reduce((sum, system) => sum + system.beams.length, 0);

test("in cut time eighths beam in fours, one beam per half-note beat", () => {
  // Bar 1 has two beamed pairs between rests; bar 3 runs four eighths into a half.
  assert.equal(beamCount(cutTime()), 3);
  assert.equal(beamCount(inMeter(cutTime(), COMMON)), 4);
});

test("cut time shows the middle of the bar: a dotted quarter from the second quarter is split there", () => {
  const line = "bar 1: rq C5q. C5e C5q";
  const bar = (score: Score) => scoreText(writeBars(score, line, "w").score).split("\n")[1];
  assert.equal(bar(cutTime()), "bar 1: rq C5q~ C5e C5e C5q");
  assert.equal(bar(inMeter(cutTime(), COMMON)), "bar 1: rq C5q. C5e C5q");
  // The familiar cut-time syncopation, a half across the middle, stays one note.
  assert.equal(scoreText(cutTime()).split("\n")[4], "bar 4: rq C5h C5q");
});

/** Where each hit of a drum line falls, and what it strikes: how it sounds, whatever its written lengths. */
function hits(line: { drums: string[] | null; beats: number }[]): string[] {
  let at = 0;
  return line.flatMap(({ drums, beats }) => {
    const hit = drums ? [`${at}:${drums.join("+")}`] : [];
    at += beats;
    return hit;
  });
}

test("drum grooves play in cut time as in 4/4, written in half-note beats", () => {
  assert.deepEqual(groovesFor(CUT), groovesFor(COMMON));
  const [cut, common] = [grooveBar("rock", CUT), grooveBar("rock", COMMON)];
  assert.deepEqual(hits(cut.hands), hits(common.hands));
  assert.deepEqual(hits(cut.feet), hits(common.feet));
});

test("a cut-time tempo is marked per half note; the score keeps quarter notes", () => {
  assert.deepEqual(tempoMarking(200, CUT), { note: "half", perMinute: 100 });
  assert.deepEqual(tempoMarking(96, COMMON), { note: "quarter", perMinute: 96 });
});
