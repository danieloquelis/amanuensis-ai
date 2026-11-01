import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutScore, staffTop, systemBottom } from "@/modules/engraving";
import { createPlaybackPlan } from "@/modules/playback";
import { applyCommand, barEvents, eventOnsets, parseScore, type Score } from "@/modules/score";

const raw = () => JSON.parse(readFileSync("tests/fixtures/engraving/tuplets.json", "utf8"));
const fixture = (): Score => parseScore(raw());
/** The fixture with its first bar's events changed, to break one rule at a time. */
const withFirstBar = (change: (events: Record<string, unknown>[]) => void, meter?: object) => {
  const data = raw();
  change(data.measures[0].voices[0].events);
  if (meter) data.measures[0].meter = meter;
  return () => parseScore(data);
};

test("a triplet's notes sound in thirds of their written value, exactly", () => {
  const [bar] = fixture().measures;
  const onsets = eventOnsets(barEvents(bar));
  // 3[C D E] in eighths, a quarter, then 3[G A B] in quarters over two beats.
  assert.deepEqual(
    onsets.map((onset) => Math.round(onset * 1000) / 1000),
    [0, 0.333, 0.667, 1, 2, 2.667, 3.333],
  );
});

test("triplets that break a rule are refused with a message that teaches it", () => {
  const triplet = (id: string) => ({ id, actual: 3, normal: 2 });
  assert.throws(
    withFirstBar((events) => {
      delete events[2].tuplet;
    }),
    /three values into the time of two/,
    "two eighths are not a triplet",
  );
  assert.throws(
    withFirstBar((events) => {
      // The quarter triplet's first note joins the eighth triplet, past the plain quarter between them.
      events[4].tuplet = triplet("tup-g1");
    }),
    /follow one another/,
  );
  assert.throws(
    withFirstBar(() => undefined, { numerator: 12, denominator: 8 }),
    /simple meters/,
    "no triplets in compound time",
  );
  assert.throws(
    withFirstBar((events) => {
      // An eighth rest before the eighth triplet pushes it half a beat late; one more replaces the quarter.
      const rest = (id: string) => ({ id, duration: { numerator: 1, denominator: 2 }, pitch: null });
      events.splice(3, 1, rest("late-2"));
      events.unshift(rest("late-1"));
    }),
    /starts on a beat/,
  );
});

test("rewriting the score never respells a triplet", () => {
  const score = fixture();
  const before = JSON.stringify(score.measures);
  const after = applyCommand(score, {
    requestId: "tempo",
    expectedRevision: score.revision,
    operation: { type: "setTempo", tempo: 100 },
  });
  assert.equal(JSON.stringify(after.measures), before);
});

test("playback gives each triplet note a third of the time of two", () => {
  const plan = createPlaybackPlan(fixture());
  const secondsPerBeat = 60 / 96;
  const first = plan.events.slice(0, 4);
  assert.deepEqual(
    first.map((event) => Math.round((event.start / secondsPerBeat) * 1000) / 1000),
    [0, 0.333, 0.667, 1],
  );
  assert.ok(Math.abs(first[0].duration - secondsPerBeat / 3) < 1e-9);
});

test("each triplet shows its 3 clear of its notes; a bracket spans it unless one beam does", () => {
  const scene = layoutScore(fixture());
  const events = scene.systems.flatMap((system) => system.events);
  const marks = scene.systems.flatMap((system) => system.tuplets);
  assert.equal(marks.length, 9, "every group in the fixture is marked");
  const byId = new Map(marks.map((mark) => [mark.id, mark]));
  // An eighth triplet beamed on its own needs only its number; a quarter triplet needs a bracket.
  assert.equal(byId.get("tup-g1")!.bracket, false);
  assert.equal(byId.get("tup-g2")!.bracket, true);
  assert.equal(byId.get("tup-g5")!.bracket, true, "a rest inside breaks the beam");
  assert.equal(byId.get("tup-g7")!.above, true, "a group of rests is marked above");
  for (const system of scene.systems) {
    for (const mark of system.tuplets) {
      const members = events.filter((item) => item.event.tuplet?.id === mark.id);
      assert.ok(mark.x1 <= members[0].x && members.at(-1)!.x <= mark.x2, `${mark.id} spans its group`);
      const top = staffTop(system, mark.staff ?? 0);
      const outside = mark.above ? mark.y < top : mark.y > systemBottom(system);
      assert.ok(outside, `${mark.id} sits outside the staff`);
      for (const item of members) {
        const stem = item.stemEnd;
        assert.ok(
          mark.above ? mark.y < Math.min(item.y, stem) : mark.y > Math.max(item.y, stem),
          `${mark.id} clears ${item.event.id}`,
        );
      }
      if (mark.above && mark.staff === undefined && system.chords.length) {
        assert.ok(system.chordY < mark.y - 7, `the chord row sits above ${mark.id}`);
      }
    }
  }
});
