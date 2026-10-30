import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFromSelection, pasteEdit } from "@/modules/editor";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
  barEvents,
  createExample,
  findStaff,
  findVoiceId,
  partHandles,
  resolvePositions,
  scoreText,
  summarizeChange,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `parts-${requests++}`, expectedRevision: score.revision, operation });
const write = (score: Score, text: string) => writeBars(score, text, `write-${requests++}`).score;

/** Piano (grand staff) and a trumpet. */
function ensemble() {
  let score = edit(createExample(), { type: "setStaffCount", partId: "piano", staves: 2 });
  score = edit(score, { type: "addPart", instrument: "trumpet" });
  return score;
}

test("adding instruments gives every bar a rest on the new staves, and handles name them", () => {
  const score = edit(ensemble(), { type: "addPart", instrument: "trumpet" });
  assert.deepEqual([...partHandles(score).values()], ["piano", "trumpet", "trumpet-2"]);
  for (const measure of score.measures) assert.equal(measure.voices.length, 4);
  assert.ok(findVoiceId(score, "piano.2"));
  assert.ok(findVoiceId(score, "trumpet-2"));
});

test("score text names every staff, and writing it back changes nothing", () => {
  let score = write(ensemble(), "bar 1 piano.2: C3h G2h\nbar 1 trumpet: E5w ; chords C");
  const text = scoreText(score);
  assert.match(text, /^parts: piano "Piano" \(treble\+bass\) \| trumpet "Trumpet in B♭" \(notes are concert pitch/m);
  assert.match(text, /^bar 1 trumpet: E5w$/m);
  assert.match(text, /^bar 1 piano: .* ; chords C/m, "chords stay on the bar's first line");
  score = write(
    score,
    text
      .split("\n")
      .filter((l) => l.startsWith("bar "))
      .join("\n"),
  );
  assert.equal(scoreText(score).replace(/revision \d+/, ""), text.replace(/revision \d+/, ""));
});

test("notes of other staves are addressed by handle", () => {
  const score = write(ensemble(), "bar 2 trumpet: D5h E5h");
  const resolved = resolvePositions(score, { type: "setPitch", eventId: "trumpet/2#2", pitch: null }) as {
    eventId: string;
  };
  assert.equal(resolved.eventId, barEvents(score.measures[1], findVoiceId(score, "trumpet")!)[1].id);
});

test("each part plays its instrument; mute silences it and volume scales it", () => {
  let score = write(ensemble(), "bar 1 trumpet: E5w");
  const trumpet = (s: Score) => createPlaybackPlan(s).events.find((e) => e.instrument === "trumpet")!;
  const loud = trumpet(score).velocity;
  score = edit(score, { type: "setPartMix", partId: "trumpet", volume: 0.4 });
  assert.ok(trumpet(score).velocity < loud);
  score = edit(score, { type: "setPartMix", partId: "trumpet", muted: true });
  assert.deepEqual(trumpet(score).notes, []);
});

test("parts can be reordered and removed; one always stays", () => {
  let score = edit(ensemble(), { type: "movePart", partId: "trumpet", beforePartId: "piano" });
  assert.deepEqual([...partHandles(score).values()], ["trumpet", "piano"]);
  assert.equal(score.measures[0].voices[0].voiceId, findVoiceId(score, "trumpet"));
  score = edit(score, { type: "removePart", partId: "trumpet" });
  assert.equal(score.parts.length, 1);
  assert.throws(() => edit(score, { type: "removePart", partId: "piano" }), /at least one/);
});

test("a grand staff goes back to one staff only when its lower staff is empty", () => {
  const score = write(ensemble(), "bar 1 piano.2: C3w");
  assert.throws(() => edit(score, { type: "setStaffCount", partId: "piano", staves: 1 }), /still has notes/);
  assert.throws(() => edit(score, { type: "setStaffCount", partId: "trumpet", staves: 2 }), /one staff/);
});

test("a large score can be read in part, and changes are reported per part", () => {
  const score = ensemble();
  const trumpetOnly = scoreText(score, { parts: ["trumpet"], bars: { from: 2, to: 3 } });
  const bars = trumpetOnly.split("\n").filter((line) => line.startsWith("bar "));
  assert.deepEqual(
    bars.map((line) => line.split(":")[0]),
    ["bar 2 trumpet", "bar 3 trumpet"],
  );
  const written = write(score, "bar 2 trumpet: G4w\nbar 3 trumpet: A4w");
  assert.deepEqual(summarizeChange(score, written), ["Bars 2–3 (trumpet): changed"]);
});

test("bars copied in one instrument's lane paste into another instrument, leaving the rest", () => {
  const score = write(ensemble(), "bar 1 trumpet: E5q D5q C5h\nbar 1 piano: C4w ; chords C");
  const trumpet = findStaff(score, "trumpet")!.id;
  const clip = copyFromSelection(score, [{ kind: "bar", id: "bar-1", staffId: trumpet }])!;
  assert.equal(clip.text, "bar 1 trumpet: E5q D5q C5h");
  const piano = findStaff(score, "piano")!.id;
  const { operation } = pasteEdit(score, clip, [{ kind: "bar", id: "bar-2", staffId: piano }], "lane");
  const pasted = edit(score, operation);
  const line = (n: number, staff: string) =>
    scoreText(pasted)
      .split("\n")
      .find((l) => l.startsWith(`bar ${n} ${staff}:`));
  assert.equal(line(2, "piano"), "bar 2 piano: E5q D5q C5h");
  assert.equal(line(1, "trumpet"), "bar 1 trumpet: E5q D5q C5h", "the copy stays");
  assert.ok(!pasted.chords.some((c) => c.measureId === "bar-2"), "only the music moves");
});
