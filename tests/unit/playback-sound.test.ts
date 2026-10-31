import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCENT_VELOCITY,
  CHORD_VELOCITY,
  createPlaybackPlan,
  DYNAMIC_VELOCITY,
  LOUD_SAMPLE_VELOCITY,
  soundsBetween,
  type PlaybackPlan,
} from "@/modules/playback";
import { applyCommand, createExample, type Operation, type Score } from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { expectedRevision: score.revision, requestId: `sound-${requests++}`, operation });
const velocityOf = (plan: PlaybackPlan, id: string) => plan.events.find((e) => e.id === id)!.velocity;

test("each written dynamic sets the velocity of the notes after it", () => {
  let score = edit(createExample(), { type: "putAnnotation", targetId: "bar-1", kind: "dynamic", text: "pp" });
  score = edit(score, { type: "putAnnotation", targetId: "note-0-2", kind: "dynamic", text: "ff" });
  const plan = createPlaybackPlan(score);
  assert.equal(velocityOf(plan, "note-0-0"), DYNAMIC_VELOCITY.pp);
  assert.equal(velocityOf(plan, "note-0-2"), DYNAMIC_VELOCITY.ff);
  assert.equal(velocityOf(plan, "note-1-0"), DYNAMIC_VELOCITY.ff);
});

test("an accent strikes harder, never beyond the MIDI maximum", () => {
  let score = edit(createExample(), { type: "setArticulation", eventId: "note-0-1", articulation: "accent" });
  assert.equal(velocityOf(createPlaybackPlan(score), "note-0-1"), DYNAMIC_VELOCITY.mf + ACCENT_VELOCITY);
  score = edit(score, { type: "putAnnotation", targetId: "note-0-1", kind: "dynamic", text: "ff" });
  assert.equal(velocityOf(createPlaybackPlan(score), "note-0-1"), 127);
});

test("mf and above play loud samples on every instrument", () => {
  for (const dynamic of ["pp", "p", "mp"]) assert.ok(DYNAMIC_VELOCITY[dynamic] < LOUD_SAMPLE_VELOCITY, dynamic);
  for (const dynamic of ["mf", "f", "ff"]) assert.ok(DYNAMIC_VELOCITY[dynamic] >= LOUD_SAMPLE_VELOCITY, dynamic);
});

test("notes are MIDI numbers: middle C is 60", () => {
  const plan = createPlaybackPlan(createExample());
  assert.deepEqual(plan.events[0].notes, [60]);
});

test("a tied note sounds once, for the summed length", () => {
  const score = edit(createExample(), { type: "setTie", eventId: "note-0-3", tied: true });
  const plan = createPlaybackPlan(score);
  const sounds = soundsBetween(plan, 0, plan.duration);
  const held = plan.events.find((e) => e.id === "note-0-3")!;
  const fromHeld = sounds.filter((s) => s.start === held.start);
  assert.equal(fromHeld.length, 1);
  assert.ok(fromHeld[0].duration > held.duration, "held into the next bar");
  assert.equal(sounds.filter((s) => s.start === held.start + held.duration).length, 0);
});

test("lookahead windows cover every sound exactly once, across repeats", () => {
  let score = edit(createExample(), { type: "putRepeat", startMeasureId: "bar-1", endMeasureId: "bar-2", count: 2 });
  score = edit(score, { type: "putChord", measureId: "bar-1", beat: 0, symbol: "C" });
  const plan = createPlaybackPlan(score);
  const whole = soundsBetween(plan, 0, plan.duration + 1);
  const windowed = [];
  for (let from = 0; from < plan.duration + 1; from += 0.37) windowed.push(...soundsBetween(plan, from, from + 0.37));
  assert.deepEqual(windowed.map((s) => `${s.start}:${s.midi}`).sort(), whole.map((s) => `${s.start}:${s.midi}`).sort());
  assert.ok(soundsBetween(plan, 0, 1).every((s) => s.start >= 0 && s.start < 1));
});

test("chord symbols sound as soft MIDI voicings, bass below the chord", () => {
  const score = edit(createExample(), { type: "putChord", measureId: "bar-1", beat: 0, symbol: "G7" });
  const [chord] = createPlaybackPlan(score).chords;
  assert.equal(chord.velocity, CHORD_VELOCITY);
  // Bass G2, then G3 B3 D4 F4.
  assert.deepEqual(chord.notes, [43, 55, 59, 62, 65]);
});
