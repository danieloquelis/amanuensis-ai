import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { letterNoteEdit } from "@/modules/editor";
import { layoutScore } from "@/modules/engraving";
import { createPlaybackPlan } from "@/modules/playback";
import {
  applyCommand,
  barEvents,
  createExample,
  inKey,
  INSTRUMENTS,
  midiPitch,
  parseScore,
  pitchName,
  scoreText,
  STEPS,
  toConcert,
  toWritten,
  writtenKey,
  type KeySignature,
  type Operation,
  type Pitch,
  type Score,
} from "@/modules/score";

let requests = 0;
const edit = (score: Score, operation: Operation) =>
  applyCommand(score, { requestId: `inst-${requests++}`, expectedRevision: score.revision, operation });
const fixture = (name: string) => parseScore(JSON.parse(readFileSync(`tests/fixtures/engraving/${name}.json`, "utf8")));
const trumpet = INSTRUMENTS.trumpet.transposition!;
const guitar = INSTRUMENTS.guitar.transposition!;
const KEYS: KeySignature[] = Array.from({ length: 15 }, (_, i) => ({ fifths: i - 7, mode: "major" }));

test("written pitch round-trips to the same sound in every key, for trumpet and guitar", () => {
  for (const t of [trumpet, guitar])
    for (const key of KEYS)
      for (const step of STEPS)
        for (const offset of [-1, 0, 1]) {
          const inScale = inKey({ step, alter: 0, octave: 4 }, key);
          if (Math.abs(inScale.alter + offset) > 1) continue;
          const pitch = { ...inScale, alter: (inScale.alter + offset) as Pitch["alter"] };
          const written = toWritten(pitch, t, key);
          assert.equal(midiPitch(written), midiPitch(pitch) + t.semitones, `${pitchName(pitch)} in ${key.fifths}`);
          assert.equal(midiPitch(toConcert(written, t, key)), midiPitch(pitch));
          // Notes of the key keep their spelling both ways.
          if (offset === 0) assert.deepEqual(toConcert(written, t, key), pitch);
        }
});

test("a B♭ trumpet's written key is a tone up, respelled beyond six accidentals", () => {
  assert.equal(writtenKey({ fifths: -3, mode: "major" }, trumpet).fifths, -1); // E♭ → F
  assert.equal(writtenKey({ fifths: 0, mode: "major" }, trumpet).fifths, 2); // C → D
  assert.equal(writtenKey({ fifths: 6, mode: "major" }, trumpet).fifths, -4); // F♯ → A♭, not G♯
  assert.equal(writtenKey({ fifths: 3, mode: "major" }, guitar).fifths, 3); // an octave changes no key
  const fSharp = { step: "F", alter: 1, octave: 4 } as const;
  assert.equal(pitchName(toWritten(fSharp, trumpet, { fifths: 6, mode: "major" })), "A♭4");
});

test("changing the instrument keeps every pitch and sets the clef", () => {
  const original = createExample();
  const trombone = edit(original, { type: "setInstrument", instrument: "trombone" });
  assert.equal(trombone.parts[0].instrument, "trombone");
  assert.equal(trombone.parts[0].name, "Trombone");
  assert.equal(trombone.parts[0].staves[0].clef, "bass");
  assert.deepEqual(trombone.measures, original.measures);
  const plain = edit(edit(original, { type: "setInstrument", instrument: "guitar" }), {
    type: "setClef",
    clef: "treble",
  });
  assert.equal(plain.parts[0].staves[0].clef, "treble");
  assert.throws(() => edit(original, { type: "setClef", clef: "percussion" }), /drums/);
  const fresh = edit(original, { type: "newScore", instrument: "flute" });
  assert.equal(fresh.parts[0].instrument, "flute");
});

test("on a bass staff G2 sits on the bottom line", () => {
  let score = edit(createExample(), { type: "setInstrument", instrument: "trombone" });
  score = edit(score, { type: "setPitch", eventId: "note-0-0", pitch: { step: "G", alter: 0, octave: 2 } });
  const system = layoutScore(score).systems[0];
  assert.equal(system.clef, "bass");
  assert.equal(system.events[0].y, system.top + 48);
});

test("guitar is drawn an octave above its sound; the concert view draws the sound", () => {
  const score = edit(createExample(), { type: "setInstrument", instrument: "guitar" });
  const written = layoutScore(score).systems[0].events[0];
  assert.equal(pitchName(written.event.pitch), "C5");
  assert.equal(pitchName(written.sounds!), "C4");
  const concert = layoutScore(score, { concertPitch: true }).systems[0].events[0];
  assert.equal(pitchName(concert.event.pitch), "C4");
  assert.equal(concert.sounds, undefined);
});

test("notes outside the instrument's range are flagged on the sheet and in score text", () => {
  const score = fixture("trumpet");
  const flagged = layoutScore(score)
    .systems.flatMap((s) => s.events)
    .filter((e) => e.outOfRange)
    .map((e) => e.event.id);
  assert.deepEqual(flagged, ["p5"]);
  const text = scoreText(score).split("\n");
  assert.equal(text[1], "instrument Trumpet in B♭ (notes are concert pitch; the sheet shows them a major 2nd higher)");
  assert.equal(text[2], "out of range for Trumpet in B♭ (E3–B♭5): 2#1 C6");
  assert.ok(!scoreText(createExample()).includes("instrument"), "a piano score reads as before");
});

test("a transposing part plays the stored concert pitch", () => {
  const plan = createPlaybackPlan(fixture("trumpet"));
  assert.deepEqual(plan.events[0].notes, [63]); // E♭4 as it sounds
  assert.equal(plan.events[0].instrument, "trumpet");
});

test("a typed letter names the written note on a transposing part, the sound otherwise", () => {
  const score = edit(createExample(), { type: "setInstrument", instrument: "trumpet" });
  const written = letterNoteEdit(score, "note-0-0", "E", { written: true }).operation;
  assert.deepEqual(written, { type: "setPitch", eventId: "note-0-0", pitch: { step: "D", alter: 0, octave: 4 } });
  const concert = letterNoteEdit(score, "note-0-0", "E").operation;
  assert.deepEqual(concert, { type: "setPitch", eventId: "note-0-0", pitch: { step: "E", alter: 0, octave: 4 } });
});

test("a typed letter picks an octave the instrument plays", () => {
  let score = edit(createExample(), { type: "setInstrument", instrument: "flute" });
  score = edit(score, { type: "setPitch", eventId: "note-0-0", pitch: null });
  const first = barEvents(score.measures[0])[0].id;
  const op = letterNoteEdit(score, first, "C").operation as { pitch: Pitch };
  assert.ok(midiPitch(op.pitch) >= INSTRUMENTS.flute.range.low);
});
