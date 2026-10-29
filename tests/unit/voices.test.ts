import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlaybackPlan, DYNAMIC_VELOCITY } from "@/modules/playback";
import {
  applyCommand,
  barEvents,
  createExample,
  durationFromBeats,
  numberedVoice,
  parseScore,
  pitchText,
  positionOf,
  resolvePositions,
  scoreText,
  voiceBars,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `voices-${requests++}`, expectedRevision: score.revision, operation });
const write = (score: Score, text: string) => writeBars(score, text, `write-${requests++}`).score;
const line = (score: Score, bar: number, voice = 1) =>
  barEvents(score.measures[bar - 1], voice === 1 ? undefined : numberedVoice(score, voice)!)
    .map((e) => `${e.pitch ? pitchText(e.pitch) : "r"}/${e.duration.numerator / e.duration.denominator}`)
    .join(" ");

/** The example with a bass line (voice 2) in bars 1–2. */
const withBass = () => write(createExample(), "bar 1 v2: C3h G2h\nbar 2 v2: A2w");

test("adding a second voice declares it and gives each bar a whole-bar rest", () => {
  const score = edit(createExample(), { type: "addVoiceBars", voice: 2, measureIds: ["bar-1", "bar-3"] });
  const voice2 = numberedVoice(score, 2)!;
  assert.deepEqual(
    score.parts[0].staves[0].voices.map((v) => v.id),
    ["voice-1", voice2],
  );
  assert.equal(barEvents(score.measures[0], voice2)[0].measureRest, true);
  assert.deepEqual(barEvents(score.measures[1], voice2), [], "bar 2 has no second voice");
  assert.throws(
    () => edit(createExample(), { type: "addVoiceBars", voice: 3, measureIds: ["bar-1"] }),
    /voice 2 first/,
  );
});

test("each voice fills its bar on its own", () => {
  const score = withBass();
  assert.equal(line(score, 1, 2), "C3/2 G2/2");
  const broken = structuredClone(score);
  broken.measures[0].voices[1].events.pop();
  assert.throws(() => parseScore(broken), /exactly 4 quarter-note beats/);
});

test("a tie in voice 2 crosses the barline only when voice 2 plays on", () => {
  let score = write(createExample(), "bar 1 v2: C3h G2h~\nbar 2 v2: G2w");
  assert.equal(barEvents(score.measures[0], numberedVoice(score, 2)!)[1].tie, true);
  score = edit(score, { type: "removeVoiceBars", voiceId: "v2", measureIds: ["bar-2"] });
  assert.equal(barEvents(score.measures[0], numberedVoice(score, 2)!)[1].tie, undefined, "the broken tie goes");
});

test("a slur joins notes of one voice only", () => {
  const score = withBass();
  const bass = barEvents(score.measures[0], numberedVoice(score, 2)!)[0].id;
  assert.throws(() => edit(score, { type: "putSlur", startEventId: "note-0-0", endEventId: bass }), /voice/);
});

test("a new meter fits every voice, and a duplicated bar copies them with new IDs", () => {
  const score = withBass();
  const twoFour = edit(score, {
    type: "setMeter",
    measureIds: ["bar-1"],
    meter: { numerator: 2, denominator: 4 },
    policy: "scale",
  });
  assert.equal(line(twoFour, 1, 2), "C3/1 G2/1");
  const copied = edit(score, { type: "duplicateMeasure", measureId: "bar-1" });
  const copy = copied.measures[1];
  assert.equal(voiceBars(copy).length, 2);
  assert.ok(voiceBars(copy)[1].events.every((e) => /-v1n\d$/.test(e.id)));
});

test("notes of voice 2 are addressed as 2v2#1 and 2v2:3", () => {
  const score = withBass();
  const [c3, g2] = barEvents(score.measures[0], numberedVoice(score, 2)!);
  assert.equal(positionOf(score, g2.id), "1v2#2");
  const resolved = resolvePositions(score, { type: "setPitch", eventId: "1v2#1", pitch: null }) as { eventId: string };
  assert.equal(resolved.eventId, c3.id);
  const byBeat = resolvePositions(score, { type: "removeEvent", eventId: "1v2:3" }) as { eventId: string };
  assert.equal(byBeat.eventId, g2.id);
});

test("score text shows each voice on its own line, and writing it back changes nothing", () => {
  let score = withBass();
  score = edit(score, { type: "putChord", measureId: "bar-1", beat: 0, symbol: "C" });
  const text = scoreText(score);
  assert.ok(text.includes("\nbar 1 v2: C3h G2h\n"), text);
  const bars = text.split("\n").filter((l) => l.startsWith("bar "));
  const again = write(score, bars.join("\n"));
  assert.equal(scoreText(again).replace(/revision \d+/, ""), text.replace(/revision \d+/, ""));
});

test("writing a voice line keeps the bar's chords; '-' removes the voice", () => {
  let score = edit(withBass(), { type: "putChord", measureId: "bar-1", beat: 0, symbol: "Am" });
  score = write(score, "bar 1 v2: A2w");
  assert.equal(score.chords.length, 1);
  assert.equal(line(score, 1, 2), "A2/4");
  score = write(score, "bar 1 v2: -");
  assert.equal(voiceBars(score.measures[0]).length, 1);
  assert.throws(() => write(score, "bar 1: -"), /main line/);
  assert.throws(() => write(score, "bar 1: C4w ; chords C\nbar 1 v2: C3w ; chords F"), /one line/);
});

test("the main line cannot be removed as a voice", () => {
  assert.throws(() => edit(withBass(), { type: "removeVoiceBars", voiceId: "voice-1" }), /main line/);
  const rested = edit(withBass(), { type: "clearMeasure", measureId: "bar-1", voiceId: "v2" });
  assert.equal(
    barEvents(rested.measures[0], numberedVoice(rested, 2)!)[0].duration.numerator,
    durationFromBeats(4).numerator,
  );
  assert.equal(line(rested, 1), line(withBass(), 1), "the main line is untouched");
});

test("both voices play, each bar's voices starting together", () => {
  const score = write(createExample(), "bar 1 v2: C3h G2h~\nbar 2 v2: G2w");
  const plan = createPlaybackPlan(score);
  const bass = plan.events.filter((e) => e.voice !== plan.primaryVoice);
  const melody = plan.events.filter((e) => e.voice === plan.primaryVoice);
  assert.deepEqual(
    bass.map((e) => [e.start, e.notes]),
    [
      [0, [48]],
      [2 * plan.secondsPerBeat, [43]],
      [4 * plan.secondsPerBeat, []],
    ],
    "G2 is held into bar 2 by its tie",
  );
  assert.equal(melody[4].start, bass[2].start, "bar 2 starts together in both voices");
  assert.equal(plan.duration, createPlaybackPlan(createExample()).duration);
});

test("a dynamic on a voice-2 note changes only voice 2", () => {
  let score = withBass();
  const bass = barEvents(score.measures[0], numberedVoice(score, 2)!)[0].id;
  score = edit(score, { type: "putAnnotation", targetId: bass, kind: "dynamic", text: "pp" });
  const plan = createPlaybackPlan(score);
  const first = (voice: string) => plan.events.find((e) => e.voice === voice)!.velocity;
  assert.equal(first(numberedVoice(score, 2)!), DYNAMIC_VELOCITY.pp);
  assert.equal(first(plan.primaryVoice), DYNAMIC_VELOCITY.mf);
});
