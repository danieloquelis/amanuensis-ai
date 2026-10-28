import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusicTools } from "@/modules/assistant";
import { createExample, createSession, describeScore, execute } from "@/modules/score";
import { createTake, describeTake, type Signal } from "@/modules/voice";
import { midi, singMelody, type SungNoteSpec } from "../support/synthetic-voice";

const melody = (...notes: [string | null, number][]): SungNoteSpec[] =>
  notes.map(([name, beats]) => ({ midi: name ? midi(name) : null, beats }));

/** Talking: short voiced syllables with gaps, about a third of the time voiced. */
const talking = (seconds: number) =>
  singMelody(
    Array.from({ length: Math.round(seconds / 0.45) }, (_, i) => [
      { midi: midi("A3") + (i % 3), beats: 0.25 },
      { midi: null, beats: 0.5 },
    ]).flat(),
    { bpm: 100, glideSeconds: 0.05 },
  );

const phrase = melody(["C4", 1], ["E4", 1], ["G4", 1], ["E4", 1], ["D4", 1], ["F4", 1], ["A4", 2]);

const join = (...signals: Signal[]): Signal => {
  const samples = new Float32Array(signals.reduce((sum, s) => sum + s.samples.length, 0));
  let offset = 0;
  for (const signal of signals) {
    samples.set(signal.samples, offset);
    offset += signal.samples.length;
  }
  return { samples, sampleRate: signals[0].sampleRate };
};

test("singing after talking is found as one sung span, and the talking is not", () => {
  const speech = talking(4);
  const take = createTake(join(speech, singMelody(phrase, { bpm: 120, vibratoCents: 30 })), []);
  const talkingEnds = speech.samples.length / speech.sampleRate;
  assert.equal(take.sung.length, 1);
  assert.ok(take.sung[0].start >= talkingEnds - 0.1, `span starts at ${take.sung[0].start}`);
});

test("the agent reads the take as a timeline of what was said and sung", () => {
  const speech = talking(3);
  const take = createTake(join(speech, singMelody(phrase, { bpm: 120 })), [
    { start: 0, end: 2.9, text: "Allegro, over Em A D G" },
  ]);
  const lines = describeTake(take).split("\n");
  assert.match(lines[1], /^0\.0–2\.9 s said: "Allegro, over Em A D G"$/);
  assert.match(lines[2], /sang: sung-1/);
});

test("a key is inferred from the chords the musician named", () => {
  const result = createMusicTools(null)("music_infer_key", { chords: ["Em", "A", "D", "G"] });
  assert.ok(result.ok);
  assert.deepEqual([(result.candidates as { name: string }[])[0].name, result.clear], ["D major", true]);
});

test("the tempo word said settles a sung tempo that could be read several ways", () => {
  // Even quarters at 66 fit 66, 99 and 132 equally; "Allegro" means the 132 reading.
  const take = createTake(singMelody(phrase, { bpm: 66 }), []);
  const result = createMusicTools(take)("music_infer_tempo", { marking: "Allegro", spanIds: ["sung-1"] });
  assert.equal(result.ok && result.bpm, 132);
});

test("a sung span is written into the score from the bar it was meant for", () => {
  const take = createTake(singMelody(phrase, { bpm: 90 }), []);
  let session = createSession(createExample());
  const tools = createMusicTools(take, {
    getScore: () => session.score,
    commit: (operation) => {
      session = execute(session, { requestId: "take", expectedRevision: session.score.revision, operation });
      return { ok: true };
    },
  });
  const result = tools("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 2 }], bpm: 90 });
  assert.equal(result.ok && result.written, true);
  const bars = describeScore(session.score).bars.map((bar) => bar.events.map((e) => e.pitch).join(" "));
  assert.deepEqual(bars.slice(1, 3), ["C4 E4 G4 E4", "D4 F4 A4"]);
});

test("a voice tool without a take explains what is missing", () => {
  const result = createMusicTools(null)("music_infer_tempo", { spanIds: ["sung-1"] });
  assert.deepEqual(result, { ok: false, error: "There is no sung span sung-1 (no voice take this turn)." });
});

test("singing the recognizer still counted as speech is recovered for the sung span", () => {
  const speech = talking(3);
  const talkingEnds = speech.samples.length / speech.sampleRate;
  // The recognizer's turn runs a second into the singing, as it often does.
  const take = createTake(join(speech, singMelody(phrase, { bpm: 120 })), [
    { start: 0, end: talkingEnds + 1, text: "this is how it goes" },
  ]);
  assert.ok(Math.abs(take.sung[0].start - talkingEnds) < 0.3, `span starts at ${take.sung[0].start}`);
});
