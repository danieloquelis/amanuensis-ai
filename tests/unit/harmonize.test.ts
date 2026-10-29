import { test } from "node:test";
import assert from "node:assert/strict";
import { createExample, primaryVoiceId, suggestChords, type KeySignature, type Score } from "@/modules/score";

/** A score from bars in the eval notation ("A4/1 G4/1 r/1"), all in one meter. */
function melody(bars: string[], numerator: number): Score {
  const base = createExample();
  return {
    ...base,
    measures: bars.map((bar, b) => ({
      ...base.measures[0],
      id: `bar-${b + 1}`,
      meter: { numerator, denominator: 4 },
      voices: [
        {
          voiceId: primaryVoiceId(base),
          events: bar.split(" ").map((token, i) => {
            const [name, beats] = token.split("/");
            const alter = name.includes("#") ? 1 : 0;
            const pitch =
              name === "r" ? null : { step: name[0] as "C", alter: alter as 0, octave: Number(name.at(-1)) };
            return { id: `n-${b}-${i}`, pitch, duration: { numerator: Number(beats) * 8, denominator: 8 } };
          }),
        },
      ],
    })),
  };
}
const C_MAJOR: KeySignature = { fifths: 0, mode: "major" };
const progression = (score: Score, key: KeySignature) =>
  suggestChords(score, { key, from: 1, to: score.measures.length }).progression;

test("Happy Birthday gets its usual tonic–dominant harmony, not the chords of its passing notes", () => {
  // birth-day to | you, hap-py | birth-day to | you — A on the downbeat is an appoggiatura to G.
  const song = melody(["A4/1 G4/1 C5/1", "B4/2 G4/0.5 G4/0.5", "A4/1 G4/1 D5/1", "C5/3"], 3);
  assert.deepEqual(
    progression(song, C_MAJOR).map((chord) => chord.replace("7", "")),
    ["C", "G", "G", "C"],
  );
});

test("an arpeggiated guitar figure is heard as the chords it outlines", () => {
  const figure = melody(
    [
      "E4/0.5 E4/0.5 G4/0.5 E4/0.25 B4/0.75 E4/0.5 G4/0.5 E4/0.5",
      "A3/0.5 C#4/0.5 E4/0.5 C#4/0.25 A4/0.75 C#4/0.5 E4/0.5 C#4/0.5",
      "D4/0.5 D4/0.5 E4/0.5 D4/0.25 A4/0.75 D4/0.5 E4/0.5 D4/0.5",
      "G3/0.5 B3/0.5 D4/0.5 B3/0.25 G4/0.75 B3/0.5 F#4/0.5 D4/0.5",
    ],
    4,
  );
  assert.deepEqual(progression(figure, { fifths: 2, mode: "major" }), ["Em", "A", "D", "G"]);
});

test("in a minor key the dominant is major, as harmonic minor makes it", () => {
  const line = melody(["E4/1 G4/1 B4/2", "A4/2 C5/2", "B4/2 D#5/2", "E5/4"], 4);
  assert.deepEqual(progression(line, { fifths: 1, mode: "minor" }), ["Em", "Am", "B", "Em"]);
});

test("each bar offers its closest alternatives with how much of the melody they hold", () => {
  const song = melody(["C4/1 E4/1 G4/2", "B3/2 D4/2"], 4);
  const [first] = suggestChords(song, { key: C_MAJOR, from: 1, to: 2 }).slots;
  assert.deepEqual(first.candidates[0], { symbol: "C", fit: 1 });
  assert.ok(first.candidates.length > 1 && first.candidates[1].fit < 1);
});

test("two chords per bar split each bar at its half", () => {
  const song = melody(["C4/2 G4/2", "F4/2 C4/2"], 4);
  const slots = suggestChords(song, { key: C_MAJOR, from: 1, to: 2, perBar: 2 }).slots;
  assert.deepEqual(
    slots.map((slot) => [slot.bar, slot.beat]),
    [
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
    ],
  );
});
