import { test } from "node:test";
import assert from "node:assert/strict";
import { craftOf } from "@/modules/assistant";
import { applyCommand, createExample, writeBars, type Score } from "@/modules/score";

let requests = 0;
/** A string duo (violin over cello) of four bars, from score text. */
function duo(text: string, bars = 4): Score {
  let score = createExample();
  score = applyCommand(score, {
    requestId: `duo-${requests++}`,
    expectedRevision: score.revision,
    operation: { type: "newScore", bars, instruments: ["violin", "cello"] },
  });
  return applyCommand(score, writeBars(score, text, `duo-${requests++}`).command);
}

const rules = { counterpoint: true };

test("parallel fifths between two voices are heard, with their bar", () => {
  const score = duo(
    ["bar 1 violin: G4h A4h", "bar 1 cello: C4h D4h", "bar 2 violin: B4w", "bar 2 cello: G3w"].join("\n"),
  );
  const craft = craftOf(score, rules);
  assert.equal(craft.facts.parallels, 1);
  assert.ok(craft.problems.some((p) => /violin and cello: parallel fifths or octaves in bars 1/.test(p)));
});

test("a line doubled in octaves on purpose is not heard as parallel octaves", () => {
  const line = "C5q D5q E5q F5q";
  const lower = "C4q D4q E4q F4q";
  const text = [1, 2].flatMap((bar) => [`bar ${bar} violin: ${line}`, `bar ${bar} cello: ${lower}`]).join("\n");
  const craft = craftOf(duo(text), rules);
  assert.equal(craft.facts.parallels, 0);
});

test("a line made of scale runs, and voices in one rhythm, are heard as student work", () => {
  const scales = ["C4e D4e E4e F4e G4e A4e B4e C5e", "C5e B4e A4e G4e F4e E4e D4e C4e"];
  const text = [1, 2, 3, 4]
    .flatMap((bar) => [`bar ${bar} violin: ${scales[bar % 2]}`, `bar ${bar} cello: C3e E3e G3e E3e C3e E3e G3e E3e`])
    .join("\n");
  const craft = craftOf(duo(text), rules);
  assert.ok(craft.facts.scales > 0.9);
  assert.ok(craft.problems.some((p) => /violin: \d+% of its notes are scale runs/.test(p)));
  assert.ok(craft.problems.some((p) => /the same rhythm in bars 1–4/.test(p)));
  // Without the rules of counterpoint, one rhythm is a choice, not a fault.
  assert.ok(!craftOf(duo(text), { counterpoint: false }).problems.some((p) => /same rhythm/.test(p)));
});

test("a melody of only long notes, and two bars copied again and again, are heard", () => {
  const melody = ["E5q G5q A5h", "G5q E5q D5h"];
  const text = [1, 2, 3, 4, 5, 6]
    .flatMap((bar) => [`bar ${bar} violin: ${melody[bar % 2]}`, `bar ${bar} cello: C3q E3q G3q B3q`])
    .join("\n");
  const craft = craftOf(duo(text, 6), { counterpoint: false });
  assert.ok(craft.problems.some((p) => /^violin: only quarter notes and longer/.test(p)));
  assert.ok(craft.problems.some((p) => /violin: the same two bars note for note 3 times/.test(p)));
  assert.equal(craft.facts.motion, 0);
});
