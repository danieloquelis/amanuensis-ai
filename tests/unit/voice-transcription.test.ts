import { test } from "node:test";
import assert from "node:assert/strict";
import { pitchName } from "@/modules/score";
import {
  estimateTempo,
  frequencyToMidi,
  hearingOf,
  quantizeNotes,
  segmentNotes,
  toBars,
  trackPitch,
  transcribeMelody,
  withPitchTrack,
  type PitchFrame,
  type Signal,
} from "@/modules/voice";
import { midi, singMelody, type SungNoteSpec } from "../support/synthetic-voice";

const RATE = 24_000;
const tone = (frequency: number, seconds: number): Signal => {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * frequency * i) / RATE);
  return { samples, sampleRate: RATE };
};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const melody = (...notes: [string | null, number][]): SungNoteSpec[] =>
  notes.map(([name, beats]) => ({ midi: name ? midi(name) : null, beats }));
const sungPitches = (signal: Signal) => segmentNotes(trackPitch(signal)).map((n) => Math.round(n.midi));

test("a steady tone is tracked to within a hertz", () => {
  const frequencies = trackPitch(tone(220, 0.5)).flatMap((f) => (f.frequency ? [f.frequency] : []));
  assert.ok(Math.abs(median(frequencies) - 220) < 1);
});

test("silence is reported as unvoiced", () => {
  const silent = { samples: new Float32Array(RATE / 2), sampleRate: RATE };
  assert.ok(trackPitch(silent).every((frame) => frame.frequency === null));
});

test("a sung phrase becomes its notes, in order", () => {
  const phrase = melody(["C4", 1], ["E4", 1], ["G4", 1], ["E4", 1]);
  assert.deepEqual(
    sungPitches(singMelody(phrase, { bpm: 90 })),
    phrase.map((n) => n.midi),
  );
});

test("vibrato stays one note", () => {
  const notes = sungPitches(singMelody(melody(["A4", 4]), { bpm: 60, vibratoCents: 60 }));
  assert.deepEqual(notes, [midi("A4")]);
});

test("a pitch sung again after a consonant counts as separate notes", () => {
  const notes = sungPitches(singMelody(melody(["G4", 1], ["G4", 1], ["G4", 1]), { bpm: 80 }));
  assert.equal(notes.length, 3);
});

test("glides between notes do not create extra notes", () => {
  const phrase = melody(["C4", 1], ["G4", 1], ["C5", 1]);
  assert.deepEqual(
    sungPitches(singMelody(phrase, { bpm: 80, glideSeconds: 0.08 })),
    phrase.map((n) => n.midi),
  );
});

test("a singer drifting sharp past a quarter tone still gets the intended notes", () => {
  const phrase = melody(["C4", 1], ["E4", 1], ["G4", 1], ["E4", 1], ["F4", 1], ["A4", 1], ["G4", 1], ["C5", 1]);
  const result = transcribeMelody(singMelody(phrase, { bpm: 90, driftCents: 80 }), { bpm: 90 });
  assert.deepEqual(
    result.notes.map((n) => n.pitch),
    phrase.map((n) => n.midi),
  );
});

test("a note sung between two pitches leans to the chord sounding under it", () => {
  // The second note lands 60 cents above E: nearer F, but the chord is C major.
  const phrase: SungNoteSpec[] = [
    { midi: midi("C4"), beats: 1 },
    { midi: midi("E4") + 0.6, beats: 1 },
    { midi: midi("G4"), beats: 2 },
  ];
  const chords = [{ beat: 0, root: { step: "C" as const, alter: 0 as const }, quality: "" as const }];
  const result = transcribeMelody(singMelody(phrase, { bpm: 90 }), { bpm: 90, chords });
  assert.equal(pitchName(result.bars[0][1].pitch!), "E4");
});

test("the tempo is estimated from where the notes start", () => {
  const phrase = melody(["C4", 1], ["D4", 0.5], ["E4", 0.5], ["F4", 1], ["G4", 1], ["A4", 2]);
  const bpm = estimateTempo(segmentNotes(trackPitch(singMelody(phrase, { bpm: 100 }))));
  assert.ok(Math.abs(bpm - 100) <= 3, `estimated ${bpm}`);
});

test("slightly early or late onsets snap to the beat grid", () => {
  const notes = [0, 0.48, 1.03, 1.49].map((start, i, all) => ({
    start,
    end: (all[i + 1] ?? 2) - 0.05,
    midi: 60 + i,
    cents: 0,
    clarity: 1,
  }));
  assert.deepEqual(
    quantizeNotes(notes, 120).map((n) => [n.start, n.beats]),
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  );
});

test("an onset sung 70 ms late at 120 BPM still lands on the beat, not a sixteenth later", () => {
  const sung = (start: number, end: number, midi: number) => ({ start, end, midi, cents: 0, clarity: 1 });
  const placed = quantizeNotes([sung(0, 0.5, 60), sung(0.57, 1.0, 62)], 120);
  assert.deepEqual(
    placed.map((n) => n.start),
    [0, 1],
  );
});

test("a real gap becomes a rest; a breath between legato notes does not", () => {
  const sung = (start: number, end: number, midi: number) => ({ start, end, midi, cents: 0, clarity: 1 });
  const placed = quantizeNotes([sung(0, 0.45, 60), sung(0.5, 0.7, 62), sung(1.5, 1.9, 64)], 120);
  assert.deepEqual(
    placed.map((n) => [n.midi, n.beats]),
    [
      [60, 1],
      [62, 1],
      [null, 1],
      [64, 1],
    ],
  );
});

test("bars always add up, and a note across a barline is split with a warning", () => {
  const { bars, warnings } = toBars(
    [
      { midi: 60, start: 0, beats: 3 },
      { midi: 62, start: 3, beats: 2 },
    ],
    { numerator: 4, denominator: 4 },
  );
  assert.deepEqual(
    bars.map((bar) => bar.reduce((sum, e) => sum + e.beats, 0)),
    [4, 4],
  );
  assert.equal(warnings.length, 1);
});

test("a sung phrase at a spoken tempo becomes written bars", () => {
  const phrase = melody(["C4", 1], ["E4", 1], ["G4", 1], ["E4", 1], ["D4", 1], ["F4", 1], ["A4", 2]);
  const result = transcribeMelody(singMelody(phrase, { bpm: 90, vibratoCents: 30 }), { bpm: 90 });
  const written = result.bars.map((bar) => bar.map((e) => `${pitchName(e.pitch)}/${e.duration}`).join(" "));
  assert.deepEqual(written, ["C4/1 E4/1 G4/1 E4/1", "D4/1 F4/1 A4/2"]);
  assert.deepEqual(result.warnings, []);
});

test("sung notes are spelled in the key", () => {
  const phrase = melody(["D4", 1], ["F#4", 1], ["A4", 1], ["C#5", 1]);
  const result = transcribeMelody(singMelody(phrase, { bpm: 90 }), { bpm: 90, key: { fifths: 2, mode: "major" } });
  assert.deepEqual(
    result.bars[0].map((e) => pitchName(e.pitch)),
    ["D4", "F♯4", "A4", "C♯5"],
  );
});

/** Pitch frames every 10 ms: `[hz, seconds, rms]` pieces, back to back. */
const frames = (...pieces: [number, number, number][]): PitchFrame[] => {
  const result: PitchFrame[] = [];
  for (const [frequency, seconds, rms] of pieces) {
    for (let i = 0; i < Math.round(seconds / 0.01); i++) {
      result.push({ time: result.length * 0.01, frequency, clarity: 0.95, rms });
    }
  }
  return result;
};

test("a fading note the tracker reads an octave low stays one note", () => {
  const notes = segmentNotes(frames([156, 0.3, 0.3], [78, 0.15, 0.12]));
  assert.deepEqual(
    notes.map((n) => Math.round(n.midi)),
    [Math.round(frequencyToMidi(156))],
  );
});

test("an octave leap sung at full voice stays two notes", () => {
  const notes = segmentNotes(frames([130.8, 0.4, 0.3], [261.6, 0.4, 0.3]));
  assert.deepEqual(
    notes.map((n) => Math.round(n.midi)),
    [midi("C3"), midi("C4")],
  );
});

test("a learned tracker's pitch and voicing replace YIN's, matched by time in the take", () => {
  const yin = frames([200, 0.1, 0.2]);
  // The span starts 1 s into the take; the track says 220 Hz there, and unvoiced after 1.05 s.
  const track = { hop: 0.016, pitch: Array(100).fill(220), confidence: Array(100).fill(0.9).fill(0.1, 66) };
  const merged = withPitchTrack(yin, track, 1);
  assert.deepEqual([merged[0].frequency, merged[9].frequency, merged[0].rms], [220, null, 0.2]);
});

test("a held note read an octave or a twelfth low for a moment stays one note", () => {
  const C4 = 261.6;
  for (const [interval, ratio] of [
    ["octave", 2],
    ["twelfth", 3],
  ] as const) {
    const notes = segmentNotes(frames([C4, 0.3, 0.3], [C4 / ratio, 0.15, 0.3], [C4, 0.3, 0.3]));
    assert.deepEqual(
      notes.map((n) => Math.round(n.midi)),
      [midi("C4")],
      `${interval} dip`,
    );
  }
});

test("how well a take was heard: clear, rough, or hard to hear", () => {
  const notes = (unclear: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ clarity: i < unclear ? 0.6 : 0.95 }));
  assert.deepEqual(
    [hearingOf(notes(1, 20)).quality, hearingOf(notes(5, 20)).quality, hearingOf(notes(10, 21)).quality],
    ["clear", "rough", "hard to hear"],
  );
});
