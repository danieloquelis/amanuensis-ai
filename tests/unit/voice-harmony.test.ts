import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusicTools } from "@/modules/assistant";
import { parseChordSymbol, pitchName } from "@/modules/score";
import { createTake, transcribeMelody, transcribeSpans } from "@/modules/voice";
import { midi, singMelody, type SungNoteSpec } from "../support/synthetic-voice";

const melody = (...notes: [string | null, number][]): SungNoteSpec[] =>
  notes.map(([name, beats]) => ({ midi: name ? midi(name) : null, beats }));
const D_MAJOR = { fifths: 2, mode: "major" as const };

test("a tune sung in another key, between semitones, is moved into the key asked for", () => {
  // Meant in D ("put it in D"); sung a fourth lower (in A) and 30 cents sharp of that.
  const sung = melody(["A3", 1], ["B3", 1], ["C#4", 1], ["D4", 1], ["E4", 1], ["C#4", 1], ["A3", 2]);
  const options = { bpm: 90, key: D_MAJOR, transpose: true };
  const result = transcribeMelody(singMelody(sung, { bpm: 90, tuningCents: 30 }), options);
  assert.deepEqual(
    result.bars.flat().map((e) => e.pitch && pitchName(e.pitch).slice(0, -1)),
    ["D", "E", "F♯", "G", "A", "F♯", "D"],
  );
});

test("unless asked to move it, a take stays at the pitch sung, only its tuning taken out", () => {
  // Sung in A, 30 cents sharp, over a score in D: it is written in A, as sung.
  const sung = melody(["A3", 1], ["B3", 1], ["C#4", 1], ["D4", 1], ["E4", 1], ["C#4", 1], ["A3", 2]);
  const result = transcribeMelody(singMelody(sung, { bpm: 90, tuningCents: 30 }), { bpm: 90, key: D_MAJOR });
  assert.equal(result.transposedBy, 0);
  assert.deepEqual(
    result.bars.flat().map((e) => e.pitch && pitchName(e.pitch).slice(0, -1)),
    ["A", "B", "C♯", "D", "E", "C♯", "A"],
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
    spans: [{ spanId: "sung-1", bar: 1, startBeat: 0 }],
    bpm: 90,
    key: D_MAJOR,
    chords: [
      { bar: 1, beat: 0, symbol: "Em" },
      { bar: 2, beat: 0, symbol: "A" },
    ],
    snapToChordTones: true,
  });
  assert.ok(result.ok);
  const [span] = result.spans as { bars: Record<string, string> }[];
  assert.equal(span.bars["bar 1"], "E4q G4q B4q G4q");
});

test("sung bits of one take, with talking between, are moved into the key asked for by the same amount", () => {
  // Meant as D F♯ A F♯ | A C♯ E C♯ in D; sung a fourth lower, 30 cents sharp, a pause between.
  const sing = (...notes: [string, number][]) => singMelody(melody(...notes), { bpm: 90, tuningCents: 30 });
  const first = sing(["A3", 1], ["C#4", 1], ["E4", 1], ["C#4", 1]);
  const second = sing(["E3", 1], ["G#3", 1], ["B3", 1], ["G#3", 1]);
  const chords = [
    { beat: 0, ...parseChordSymbol("D")! },
    { beat: 4, ...parseChordSymbol("A")! },
  ];
  const results = transcribeSpans(
    [
      { signal: first, bar: 1, startBeat: 0 },
      { signal: second, bar: 2, startBeat: 0 },
    ],
    { bpm: 90, meter: { numerator: 4, denominator: 4 }, key: D_MAJOR, chords, transpose: true },
  );
  const steps = (signal: (typeof results)[number]) =>
    signal.bars[0].map((e) => e.pitch && pitchName(e.pitch).slice(0, -1));
  assert.deepEqual(
    results.map((r) => r.transposedBy),
    [5, 5],
  );
  assert.deepEqual(results.map(steps), [
    ["D", "F♯", "A", "F♯"],
    ["A", "C♯", "E", "C♯"],
  ]);
});
