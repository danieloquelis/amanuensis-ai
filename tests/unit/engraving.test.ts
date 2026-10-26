import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { beatX, layoutScore, type Scene } from "@/modules/engraving";
import { applyCommand, createExample, movePitch, parseScore, type Operation, type Score } from "@/modules/score";

const FIXTURES = "tests/fixtures/engraving";
const LINE_END = 846;
const STEM_LENGTH = 42;
const EPSILON = 0.01;

const fixture = (name: string) => parseScore(JSON.parse(readFileSync(`${FIXTURES}/${name}.json`, "utf8")));
const allFixtures = () => [...readdirSync(FIXTURES).map((file) => fixture(file.replace(".json", ""))), createExample()];
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { expectedRevision: score.revision, requestId: "test", operation });
const eventsOf = (scene: Scene) => scene.systems.flatMap((system) => system.events);

test("no two events in a bar overlap, including accidentals, dots and flags", () => {
  for (const score of allFixtures()) {
    for (const system of layoutScore(score).systems) {
      for (const bar of system.bars) {
        const events = system.events.filter((e) => e.measure === bar.number - 1);
        assert.ok(events[0].left > bar.x, `${score.id} bar ${bar.number}: first event clears the barline`);
        if (bar.meterX !== null && bar.x > system.bars[0].x) {
          assert.ok(events[0].left > bar.meterX + 13, `${score.id} bar ${bar.number}: clears the time signature`);
        }
        assert.ok(events.at(-1)!.right < bar.endX, `${score.id} bar ${bar.number}: last event clears the barline`);
        for (let i = 1; i < events.length; i++) {
          assert.ok(
            events[i].left >= events[i - 1].right - EPSILON,
            `${score.id} bar ${bar.number}: events ${i - 1} and ${i} overlap`,
          );
        }
      }
    }
  }
});

test("bars are contiguous and justified lines end exactly at the margin", () => {
  for (const score of allFixtures()) {
    const { systems } = layoutScore(score);
    systems.forEach((system, index) => {
      system.bars.slice(1).forEach((bar, i) => assert.ok(Math.abs(bar.x - system.bars[i].endX) < EPSILON));
      assert.equal(system.endX, system.bars.at(-1)!.endX);
      if (index < systems.length - 1)
        assert.ok(Math.abs(system.endX - LINE_END) < EPSILON, `${score.id} line ${index}`);
    });
  }
});

test("line breaking balances lines and leaves a short final phrase ragged", () => {
  assert.deepEqual(
    layoutScore(fixture("long")).systems.map((s) => s.bars.length),
    [4, 4, 4],
  );
  assert.equal(layoutScore(createExample()).systems.length, 1);
  const short = layoutScore(fixture("short")).systems[0];
  assert.ok(short.endX < LINE_END - 100, "one bar is not spread across the whole page");
  assert.ok(short.bars[0].final);
});

test("time signatures appear at the start and where the meter changes, not on every line", () => {
  const long = layoutScore(fixture("long"));
  assert.notEqual(long.systems[0].bars[0].meterX, null);
  assert.equal(long.systems[1].bars[0].meterX, null);
  const dense = layoutScore(fixture("dense"));
  const meterBars = dense.systems.flatMap((s) => s.bars.filter((b) => b.meterX !== null).map((b) => b.number));
  assert.deepEqual(meterBars, [1, 2, 3, 4, 5]);
});

test("beams slope gently and every beamed stem keeps a readable length", () => {
  for (const score of allFixtures()) {
    for (const system of layoutScore(score).systems) {
      for (const beam of system.beams) {
        assert.ok(Math.abs(beam.y2 - beam.y1) <= 12 + EPSILON, `${score.id}: beam rises at most one space`);
        if (beam.x2 !== beam.x1) assert.ok(Math.abs((beam.y2 - beam.y1) / (beam.x2 - beam.x1)) <= 0.3 + EPSILON);
      }
      for (const item of system.events.filter((e) => system.beamedIds.includes(e.event.id))) {
        const stem = item.stemDown ? item.stemEnd - item.y : item.y - item.stemEnd;
        assert.ok(stem >= STEM_LENGTH - EPSILON, `${score.id} ${item.event.id}: stem ${stem.toFixed(1)}`);
      }
    }
  }
});

test("a rising pair of eighths gets a rising beam", () => {
  const [firstBeam] = layoutScore(fixture("keys")).systems[0].beams;
  assert.ok(firstBeam.y2 < firstBeam.y1, "D4–E4 eighths rise");
});

test("a group whose inner note peaks above both ends gets a flat beam", () => {
  const sixteenth = (step: "E" | "A" | "F") => ({
    pitch: { step, octave: 4, alter: 0 as const },
    duration: 0.25 as const,
  });
  const concave = edit(createExample(), {
    type: "replaceMeasure",
    measureId: "bar-1",
    events: [sixteenth("E"), sixteenth("A"), sixteenth("F"), sixteenth("F"), { pitch: null, duration: 3 }],
  });
  const [primary] = layoutScore(concave).systems[0].beams;
  assert.equal(primary.y1, primary.y2);
});

test("accidentals follow the key signature and reset at each barline", () => {
  const scene = layoutScore(fixture("keys"));
  const byId = new Map(eventsOf(scene).map((e) => [e.event.id, e]));
  assert.equal(byId.get("a2")!.accidental, null, "F♯ is in D major");
  assert.equal(byId.get("a6")!.accidental, null, "C♯ is in D major");
  assert.equal(byId.get("b2")!.accidental, 0, "F natural needs a natural sign");
  assert.equal(byId.get("b3")!.accidental, 1, "F♯ after F natural in the same bar needs a sharp");
  assert.equal(byId.get("b0")!.accidental, null, "F♯5 in a new bar uses the key");
  for (const system of scene.systems) assert.equal(system.keySignature.length, 2);
  const cMinor = layoutScore(fixture("long"));
  assert.deepEqual(
    cMinor.systems[0].keySignature.map((mark) => mark.alter),
    [-1, -1, -1],
  );
});

test("key signatures are validated, set by one operation and steer diatonic steps", () => {
  const score = edit(createExample(), { type: "setKey", key: { fifths: 2, mode: "major" } });
  assert.deepEqual(score.key, { fifths: 2, mode: "major" });
  assert.deepEqual(score.measures, createExample().measures, "written pitches are untouched");
  assert.throws(() => edit(score, { type: "setKey", key: { fifths: 8, mode: "major" } }), /Invalid operation/);
  assert.deepEqual(movePitch({ step: "E", octave: 4, alter: 0 }, 1, score.key), { step: "F", octave: 4, alter: 1 });
  assert.deepEqual(movePitch({ step: "F", octave: 4, alter: 1 }, 1, score.key), { step: "G", octave: 4, alter: 0 });
  assert.deepEqual(parseScore(JSON.parse(JSON.stringify(score))).key, score.key);
  assert.equal(createExample().key, undefined, "older files without a key stay valid as C major");
});

test("indication text wraps at word boundaries", () => {
  const scene = layoutScore(fixture("dense"));
  const lines = scene.systems[0].labels.filter((l) => l.kind === "text").map((l) => l.text);
  assert.deepEqual(lines, ["dolce, with a long expressive", "indication that wraps"]);
});

test("a width override is honoured but never squeezes a bar below its content", () => {
  const dense = fixture("dense");
  const narrow = edit(dense, { type: "setMeasureWidth", measureId: "m1", width: 100 });
  const bar = layoutScore(narrow).systems[0].bars[0];
  assert.ok(bar.width > 100, "too-narrow override falls back to the minimum collision-free width");
});

test("the playhead moves forward through a bar at the music's pace", () => {
  for (const system of layoutScore(fixture("dense")).systems) {
    for (const bar of system.bars) {
      let previous = -Infinity;
      for (let beat = bar.beat; beat < bar.beat + bar.capacity; beat += 0.125) {
        const x = beatX(bar, beat);
        assert.ok(x >= previous && x >= bar.x && x <= bar.endX);
        previous = x;
      }
    }
  }
});

test("layout is deterministic", () => {
  for (const score of allFixtures()) assert.deepEqual(layoutScore(score), layoutScore(parseScore(score)));
});
