import { test } from "node:test";
import assert from "node:assert/strict";
import { listenToBand } from "@/modules/assistant";
import { createExample, createSession, execute, writeBars, type InstrumentId, type Score } from "@/modules/score";

/** The example song with a bass and drums added, then the bars written as score text. */
function band(text: string): Score {
  let session = createSession(createExample());
  for (const instrument of ["bass", "drums"] as InstrumentId[]) {
    session = execute(session, {
      requestId: `add-${instrument}`,
      expectedRevision: session.score.revision,
      operation: { type: "addPart", instrument },
    });
  }
  return execute(session, writeBars(session.score, text, "bars", "concert", { keepHarmony: true }).command).score;
}

const BARS = [1, 2, 3, 4];
const CHORDS = ["C", "F", "G", "C"];

test("the band hears a bass that loops, misses the kick and the roots, and drums with no fill", () => {
  const score = band(
    [
      ...BARS.map((bar) => `bar ${bar}: C4q E4q G4q C5q ; chords ${CHORDS[bar - 1]}`),
      ...BARS.map((bar) => `bar ${bar} bass: E2w`),
      ...BARS.map((bar) => `bar ${bar} drums: <hat>q <hat>q <hat>q <hat>q`),
      ...BARS.map((bar) => `bar ${bar} drums v2: <kick>q <kick>q <kick>q <kick>q`),
    ].join("\n"),
  );
  const { lines, problems } = listenToBand(score, new Map([["bass", "Rumble"]]));
  assert.ok(lines.some((line) => /^Rumble \(bass\): plays bars 1–4, about 1 notes a bar, E2–E2$/.test(line)));
  const heard = problems.join("\n");
  assert.match(heard, /Rumble \(bass\): lands with the kick on 4 of 16 kicks/);
  assert.match(heard, /Rumble \(bass\): the same bar in 4 of 4 bars/);
  assert.match(heard, /Rumble \(bass\): on the chord's root at the start of only 0 of 4 bars/);
  assert.match(heard, /drums: no fill or crash/);
});

test("parts on the chords, a bass on the roots with the kick, and a fill leave nothing to fix", () => {
  const roots = ["C2", "F2", "G2", "C2"];
  const tune = ["C4q E4q G4q C5q", "F4q A4q C5q A4q", "G4q B4q D5q B4q", "E4q G4q C5q G4q"];
  const score = band(
    [
      ...BARS.map((bar) => `bar ${bar}: ${tune[bar - 1]} ; chords ${CHORDS[bar - 1]}`),
      ...BARS.map((bar) => `bar ${bar} bass: ${roots[bar - 1]}h ${roots[bar - 1]}h`),
      ...BARS.map((bar) => `bar ${bar} drums: <hat>q <hat>q <hat>q ${bar === 4 ? "<tom1>q" : "<hat>q"}`),
      ...BARS.map((bar) => `bar ${bar} drums v2: <kick>h <kick>h`),
    ].join("\n"),
  );
  // Nothing to fix; the bass locked with the kick is a fact about the band.
  const { lines, problems } = listenToBand(score);
  assert.deepEqual(problems, []);
  assert.ok(lines.includes("bass: lands with the kick on 8 of 8 kicks"));
});
