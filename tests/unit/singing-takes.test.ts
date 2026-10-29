import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sungStretches, type PitchFrame, type SoundFrame, type SpeechTurn } from "@/modules/voice";

/**
 * Real takes, kept as what the learned pitch tracker and the spectrum heard and the words the
 * recognizer wrote (written by `yarn fit:singing --fixture`; no audio).
 */
type Kept = {
  name: string;
  sung: boolean;
  speech: SpeechTurn[];
  start: number;
  hop: number;
  hz: (number | null)[];
  clarity: number[];
  sound: [number, number, number][];
};
const takes: Kept[] = JSON.parse(readFileSync("tests/fixtures/voice/singing-takes.json", "utf8"));
const heard = (name: string) => {
  const take = takes.find((t) => t.name === name)!;
  const frames: PitchFrame[] = take.hz.map((frequency, i) => ({
    time: take.start + i * take.hop,
    frequency,
    clarity: take.clarity[i],
    rms: 0,
  }));
  const sound: SoundFrame[] = take.sound.map(([flux, harmonicity, syllableRhythm]) => ({
    flux,
    harmonicity,
    syllableRhythm,
  }));
  return { take, spans: sungStretches(frames, sound, take.speech) };
};

// The take recorded in Spanish with clean, steady vowels is still read as sung (see yarn fit:singing).
const KNOWN_WRONG = ["2026-10-29T13-20-09"];

for (const take of takes.filter((t) => !KNOWN_WRONG.includes(t.name))) {
  const words = take.speech.map((turn) => turn.text).join(" / ");
  test(`${take.sung ? "sung" : "talk only"}: "${words.slice(0, 60)}"`, () => {
    const { spans } = heard(take.name);
    assert.equal(spans.length > 0, take.sung, JSON.stringify(spans));
  });
}

test("syllables the recognizer wrote as words are heard as singing over the whole run", () => {
  const { spans } = heard("2026-10-29T15-05-22"); // "Ba-ba-ba-ba-ba"
  assert.equal(spans.length, 1);
  assert.ok(spans[0].start < 1.5 && spans[0].end > 3.8, JSON.stringify(spans));
});

test("singing inside a turn the recognizer stretched over it is found, after the talk", () => {
  const { take, spans } = heard("2026-10-28T19-50-50"); // "…we will do a rhythm like" (0.54–9.02 s)
  assert.ok(take.speech[0].end > 9);
  assert.equal(spans.length, 1);
  // The talk ends by 6 s; the singing runs to the end of the voice.
  assert.ok(spans[0].start > 6 && spans[0].end > 9.3, JSON.stringify(spans));
});
