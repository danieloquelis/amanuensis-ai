import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { layoutScore } from "@/modules/engraving";
import {
  applyCommand,
  barEvents,
  barStyle,
  createExample,
  everyEvent,
  parseScore,
  SCORE_LIMITS,
  type Operation,
  type Score,
} from "@/modules/score";

const FIXTURES = "tests/fixtures/engraving";
const SCENES = "tests/fixtures/engraving-scenes";
const raw = (name: string) => JSON.parse(readFileSync(`${FIXTURES}/${name}.json`, "utf8"));
let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `v3-${requests++}`, expectedRevision: score.revision, operation });

/** A v2 score: one list of events per bar, the style on the bar, no parts. */
function asVersion2(score: Score) {
  const { parts, ...rest } = structuredClone(score);
  assert.ok(parts.length);
  return {
    ...rest,
    schemaVersion: 2,
    measures: rest.measures.map(({ voices, ...measure }) => ({
      ...measure,
      events: voices[0].events,
      ...(voices[0].style ? { style: voices[0].style } : {}),
    })),
    annotations: rest.annotations.map((annotation) => {
      const copy = { ...annotation };
      delete copy.staffId;
      return copy;
    }),
  };
}

test("a v2 score opens as one piano part, keeping every ID, revision, pitch and duration", () => {
  const v2 = raw("leadsheet");
  const score = parseScore(v2);
  assert.equal(score.schemaVersion, 3);
  assert.equal(score.revision, v2.revision);
  assert.deepEqual(score.parts, [
    {
      id: "part-1",
      instrument: "piano",
      name: "Piano",
      staves: [{ id: "staff-1", clef: "treble", voices: [{ id: "voice-1" }] }],
    },
  ]);
  v2.measures.forEach((measure: { id: string; events: unknown[]; style?: string }, index: number) => {
    assert.equal(score.measures[index].id, measure.id);
    assert.deepEqual(barEvents(score.measures[index]), measure.events);
    assert.equal(barStyle(score.measures[index]), measure.style);
  });
});

test("v2 and v3 copies of the same score open identically", () => {
  const original = createExample();
  assert.deepEqual(parseScore(asVersion2(original)), original);
  assert.deepEqual(parseScore(structuredClone(original)), original);
});

test("a dynamic on a bar gets the staff; one on a note does not", () => {
  let score = edit(createExample(), { type: "putAnnotation", targetId: "bar-2", kind: "dynamic", text: "p" });
  score = edit(score, { type: "putAnnotation", targetId: "note-0-1", kind: "dynamic", text: "f" });
  const opened = parseScore(asVersion2(score));
  assert.equal(opened.annotations.find((a) => a.targetId === "bar-2")?.staffId, "staff-1");
  assert.equal(opened.annotations.find((a) => a.targetId === "note-0-1")?.staffId, undefined);
});

test("a file already using voice-1 as an ID gets a free voice ID", () => {
  const v2 = asVersion2(createExample());
  v2.measures[0].events[0].id = "voice-1";
  const score = parseScore(v2);
  assert.equal(score.parts[0].staves[0].voices[0].id, "voice-1-2");
  assert.equal(barEvents(score.measures[0])[0].id, "voice-1");
});

test("broken structure is rejected with a readable message", () => {
  const missingMainLine = structuredClone(createExample());
  missingMainLine.measures[1].voices = [];
  assert.throws(() => parseScore(missingMainLine), /voices|main line/);
  const twice = structuredClone(createExample());
  twice.measures[0].voices.push(structuredClone(twice.measures[0].voices[0]));
  assert.throws(() => parseScore(twice), /out of order or twice|unique/);
  const undeclared = structuredClone(createExample());
  undeclared.measures[0].voices[0].voiceId = "voice-9";
  assert.throws(() => parseScore(undeclared), /does not declare/);
  const percussion = structuredClone(createExample());
  percussion.parts[0].staves[0].clef = "percussion";
  assert.throws(() => parseScore(percussion), /only for drums/);
  const unnamed = edit(createExample(), { type: "putAnnotation", targetId: "bar-2", kind: "dynamic", text: "p" });
  delete unnamed.annotations[0].staffId;
  assert.throws(() => parseScore(unnamed), /which staff/);
});

test("the score holds a limited number of events in all", () => {
  assert.ok(SCORE_LIMITS.events >= SCORE_LIMITS.measures * SCORE_LIMITS.eventsPerMeasure);
  assert.ok(everyEvent(createExample()).length <= SCORE_LIMITS.events);
});

test("bar operations keep every staff's main line", () => {
  let score = edit(createExample(), { type: "appendMeasure" });
  assert.equal(score.measures.at(-1)!.voices.length, 1);
  score = edit(score, { type: "setMeasureStyle", measureId: "bar-2", style: "slashes" });
  assert.equal(barStyle(score.measures[1]), "slashes");
  score = edit(score, { type: "clearMeasure", measureId: "bar-2", staffId: "staff-1" });
  assert.equal(barStyle(score.measures[1]), undefined);
  assert.equal(barEvents(score.measures[1])[0].measureRest, true);
  assert.throws(() => edit(score, { type: "clearMeasure", measureId: "bar-2", staffId: "staff-9" }), /staff/);
  const fresh = edit(score, { type: "newScore", bars: 2 });
  assert.equal(fresh.parts.length, 1);
  assert.equal(fresh.measures[0].voices[0].voiceId, fresh.parts[0].staves[0].voices[0].id);
});

test("every engraving fixture, still stored as v2, lays out exactly as before the change", () => {
  for (const file of readdirSync(SCENES)) {
    const name = file.replace(".json", "");
    const score = name === "example" ? createExample() : parseScore(raw(name));
    const stored = JSON.parse(readFileSync(`${SCENES}/${file}`, "utf8"));
    assert.deepEqual(JSON.parse(JSON.stringify(layoutScore(score))), stored, name);
  }
});
