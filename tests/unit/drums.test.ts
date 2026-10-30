import { test } from "node:test";
import assert from "node:assert/strict";
import { addDrumPieceEdit, drumDragEdit, drumRestEdit, removeHeadEdit, stepHeadEdit } from "@/modules/editor";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
  barEvents,
  createExample,
  DRUM_PIECES,
  findVoiceId,
  GROOVE_NAMES,
  grooveBar,
  scoreText,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `drums-${requests++}`, expectedRevision: score.revision, operation });
const meter = (text: string) => {
  const [numerator, denominator] = text.split("/").map(Number);
  return { numerator, denominator: denominator as 4 | 8 };
};

/** Piano with a drum part, four bars. */
function band() {
  return edit(createExample(), { type: "newScore", bars: 4, instruments: ["piano", "drums"] } as Operation);
}
const bars = (score: Score) => score.measures.map((m) => m.id);
const line = (score: Score, n: number, voice: string) =>
  scoreText(score)
    .split("\n")
    .find((l) => l.startsWith(`bar ${n} ${voice}:`))!
    .replace(/^bar \d+ [\w ]+: /, "");

test("a drum part has hands and feet on a percussion staff, and holds hits, not pitches", () => {
  const score = band();
  const drums = score.parts[1];
  assert.equal(drums.staves[0].clef, "percussion");
  assert.equal(drums.staves[0].voices.length, 2);
  assert.throws(() => writeBars(score, "bar 1 drums: C4w", "pitch"), /hits, not pitches/);
  assert.throws(() => writeBars(score, "bar 1 piano: <snare>w", "hit"), /drum part/);
  assert.throws(() => writeBars(score, "bar 1 drums: <snare>h~ <snare>h", "tie"), /cannot be tied/);
  // An empty part can become drums (and gets its feet voice); one with notes cannot.
  const kit = edit(score, { type: "setInstrument", partId: "piano", instrument: "drums" });
  assert.equal(kit.parts[0].staves[0].voices.length, 2);
  assert.throws(() => edit(createExample(), { type: "setInstrument", instrument: "drums" }), /clear these bars/);
});

test("every groove fills its bars exactly, and a groove in the wrong meter names the ones that fit", () => {
  for (const name of GROOVE_NAMES)
    for (const text of ["4/4", "3/4", "6/8"]) {
      let bar;
      try {
        bar = grooveBar(name, meter(text), true);
      } catch {
        continue;
      }
      const total = (values: { beats: number }[]) => values.reduce((sum, v) => sum + v.beats, 0);
      const capacity = (meter(text).numerator * 4) / meter(text).denominator;
      assert.equal(total(bar.hands), capacity, `${name} hands in ${text}`);
      assert.equal(total(bar.feet), capacity, `${name} feet in ${text}`);
    }
  const fresh = band();
  const waltzTime = edit(fresh, {
    type: "setMeter",
    measureIds: bars(fresh),
    meter: meter("3/4"),
    policy: "auto",
  } as Operation);
  assert.throws(
    () => edit(waltzTime, { type: "putGroove", measureIds: [waltzTime.measures[0].id], groove: "rock" }),
    /In 3\/4: waltz/,
  );
});

test("a groove with a fill writes hands and feet, ends down the toms, and crashes into the next bar", () => {
  const fresh = band();
  const score = edit(fresh, { type: "putGroove", measureIds: bars(fresh).slice(0, 2), groove: "rock", fill: true });
  assert.equal(line(score, 1, "drums"), "<hat>e <hat>e <snare hat>e <hat>e <hat>e <hat>e <snare hat>e <hat>e");
  assert.equal(line(score, 1, "drums v2"), "<kick>q rq <kick>q rq");
  assert.match(line(score, 2, "drums"), /<snare>e <tom1>e <tom2>e <tom3>e$/);
  assert.equal(line(score, 3, "drums"), "<crash>w");
  // Score text writes back to the same bars.
  const text = scoreText(score)
    .split("\n")
    .filter((l) => l.startsWith("bar "))
    .join("\n");
  assert.equal(
    scoreText(writeBars(score, text, "again").score).replace(/revision \d+/, ""),
    scoreText(score).replace(/revision \d+/, ""),
  );
});

test("drums play kit samples that ring, and the next closed hi-hat chokes an open one", () => {
  let score = band();
  score = writeBars(score, "bar 1 drums: <hatopen>e <hat>e <crash>e re rh", "hats").score;
  const plan = createPlaybackPlan(score);
  const hits = plan.events.filter((e) => e.instrument === "drums" && e.notes.length);
  const [open, closed, crash] = hits;
  assert.deepEqual(open.notes, [DRUM_PIECES.hatopen.midi]);
  assert.deepEqual(closed.notes, [DRUM_PIECES.hat.midi]);
  assert.ok(Math.abs(open.duration * open.gate - (closed.start - open.start)) < 1e-6, "choked at the closed hit");
  assert.ok(crash.duration * crash.gate > 2, "a crash rings past its eighth");
});

test("by hand: a rest becomes a snare, a drag steps through the kit, and stacking adds the usual partner", () => {
  const score = band();
  const hands = barEvents(score.measures[0], findVoiceId(score, "drums")!)[0];
  const snare = edit(score, drumRestEdit(score, hands.id).operation);
  const hit = barEvents(snare.measures[0], findVoiceId(snare, "drums")!)[0];
  assert.deepEqual(hit.drums, ["snare"]);
  const dragged = (steps: number) => {
    const moved = edit(snare, drumDragEdit(snare, hit.id, 0, steps)!.operation);
    return barEvents(moved.measures[0], findVoiceId(moved, "drums")!)[0].drums;
  };
  // One step up changes the head in place (side stick on the snare's line), two reach the next tom.
  assert.deepEqual(dragged(1), ["stick"]);
  assert.deepEqual(dragged(2), ["tom2"]);
  assert.deepEqual(dragged(-1), ["tom3"]);
  const stacked = edit(snare, addDrumPieceEdit(snare, hit.id)!.operation);
  assert.deepEqual(barEvents(stacked.measures[0], findVoiceId(stacked, "drums")!)[0].drums, ["snare", "hat"]);
  // A hi-hat alone gets the snare under it.
  const hat = edit(snare, { type: "setDrums", eventId: hit.id, drums: ["hat"] });
  const backbeat = edit(hat, addDrumPieceEdit(hat, hit.id)!.operation);
  assert.deepEqual(barEvents(backbeat.measures[0], findVoiceId(backbeat, "drums")!)[0].drums, ["snare", "hat"]);
});

test("one head of a stem: deleting it leaves the others, and stepping moves only it", () => {
  const score = writeBars(band(), "bar 1 drums: <snare hat>q rq rh\nbar 1 piano: <C4 E4 G4>w", "heads").score;
  const hit = barEvents(score.measures[0], findVoiceId(score, "drums")!)[0];
  const noSnare = edit(score, removeHeadEdit(score, hit.id, 0)!.operation);
  assert.deepEqual(barEvents(noSnare.measures[0], findVoiceId(noSnare, "drums")!)[0].drums, ["hat"]);
  const chord = barEvents(score.measures[0], findVoiceId(score, "piano")!)[0];
  const step = stepHeadEdit(score, chord.id, 1, 1)!;
  const moved = edit(score, step.edit.operation);
  assert.equal(line(moved, 1, "piano"), "<C4 F4 G4>w");
  assert.equal(step.head, 1, "the moved note stays picked");
  assert.equal(removeHeadEdit(noSnare, hit.id, 0), null, "a single head is deleted by making a rest");
});
