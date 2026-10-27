import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusicTools } from "@/modules/assistant";
import { pitchName, type Pitch } from "@/modules/score";
import { createTake, transcribeMelody } from "@/modules/voice";
import { midi, singMelody, type SungNoteSpec } from "../support/synthetic-voice";

const melody = (...notes: [string | null, number][]): SungNoteSpec[] =>
  notes.map(([name, beats]) => ({ midi: name ? midi(name) : null, beats }));
const D_MAJOR = { fifths: 2, mode: "major" as const };

test("a tune sung in another key, between semitones, is written in the key asked for", () => {
  // Meant in D; sung a fourth lower (in A) and 30 cents sharp of that.
  const sung = melody(["A3", 1], ["B3", 1], ["C#4", 1], ["D4", 1], ["E4", 1], ["C#4", 1], ["A3", 2]);
  const result = transcribeMelody(singMelody(sung, { bpm: 90, tuningCents: 30 }), { bpm: 90, key: D_MAJOR });
  assert.deepEqual(
    result.bars.flat().map((e) => e.pitch && pitchName(e.pitch).slice(0, -1)),
    ["D", "E", "F♯", "G", "A", "F♯", "D"],
  );
});

test("a phrase can start partway into the first bar", () => {
  const sung = melody(["E4", 0.5], ["G4", 0.5], ["B4", 1], ["G4", 1], ["E4", 0.5]);
  const result = transcribeMelody(singMelody(sung, { bpm: 90 }), { bpm: 90, key: D_MAJOR, startBeat: 0.5 });
  assert.deepEqual(result.bars[0][0], { pitch: null, duration: 0.5 });
});

test("in an arpeggio, a note sung nearly a semitone off lands on the chord tone", () => {
  // Em then A arpeggios; the first B is sung 90 cents flat, nearer B♭ than B.
  const sung = melody(["E4", 1], ["G4", 1], ["B4", 1], ["G4", 1], ["A4", 1], ["C#5", 1], ["E5", 1], ["C#5", 1]);
  sung[2] = { ...sung[2], midi: sung[2].midi! - 0.9 };
  const tools = createMusicTools(createTake(singMelody(sung, { bpm: 90 }), []));
  const result = tools("voice_transcribe_melody", {
    spanId: "sung-1",
    bpm: 90,
    key: D_MAJOR,
    chords: [
      { bar: 1, beat: 0, symbol: "Em" },
      { bar: 2, beat: 0, symbol: "A" },
    ],
    startBeat: 0,
    snapToChordTones: true,
  });
  assert.ok(result.ok);
  const bars = result.bars as { pitch: Pitch | null }[][];
  assert.equal(pitchName(bars[0][2].pitch!), "B4");
});
