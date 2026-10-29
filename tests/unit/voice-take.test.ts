import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusicTools } from "@/modules/assistant";
import { createExample, createSession, describeScore, execute } from "@/modules/score";
import { createTake, describeTake, takeParts, type Signal } from "@/modules/voice";
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
  // Even quarters at 66 fit 66, 99 and 132 equally; "Allegro" means the 132 reading. The beat is
  // read in 2% steps, so within one step of 132 is that reading.
  const take = createTake(singMelody(phrase, { bpm: 66 }), []);
  const result = createMusicTools(take)("music_infer_tempo", { marking: "Allegro", spanIds: ["sung-1"] });
  assert.ok(result.ok && Math.abs(Number(result.bpm) - 132) <= 132 * 0.02, `read ${result.ok && result.bpm}`);
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

test("the notes heard in a span are listed as sung, in order, for the agent to check", () => {
  const take = createTake(singMelody(phrase, { bpm: 90 }), []);
  const result = createMusicTools(take)("voice_hear_notes", { spanId: "sung-1" });
  assert.ok(result.ok);
  assert.equal(result.count, phrase.length);
  const names = String(result.notes)
    .split(" · ")
    .map((note) => note.split(" ")[1].replace("?", ""));
  assert.deepEqual(names, ["C4", "E4", "G4", "E4", "D4", "F4", "A4"]);
});

test("singing after a pause is found even when the recognizer's speech turn runs over it", () => {
  const speech = talking(4);
  const pause = singMelody([{ midi: null, beats: 1 }], { bpm: 120 });
  const singing = singMelody(phrase, { bpm: 120 });
  const take = createTake(join(speech, pause, singing), [{ start: 0, end: 8.5, text: "a rhythm like" }]);
  const singingStarts = (speech.samples.length + pause.samples.length) / speech.sampleRate;
  assert.equal(take.sung.length, 1);
  // The synthetic voice's attack takes a moment to be heard as pitched.
  const ATTACK = 0.3;
  assert.ok(Math.abs(take.sung[0].start - singingStarts) < ATTACK, `span starts at ${take.sung[0].start}`);
  assert.ok(take.speech[0].end <= singingStarts, `speech now ends at ${take.speech[0].end}`);
});

test("a short spoken turn that starts with a quiet moment is still talk, not singing", () => {
  const quiet = singMelody([{ midi: null, beats: 1 }], { bpm: 120 });
  const take = createTake(join(quiet, talking(2)), [{ start: 0, end: 2.5, text: "then in the second bar" }]);
  assert.deepEqual([take.speech[0].end, take.sung.length], [2.5, 0]);
});

test("without a spoken tempo, transcription reads it from the singing and says so", () => {
  const take = createTake(singMelody(phrase, { bpm: 90 }), []);
  let session = createSession(createExample());
  const tools = createMusicTools(take, {
    getScore: () => session.score,
    commit: (operation) => {
      session = execute(session, { requestId: "take", expectedRevision: session.score.revision, operation });
      return { ok: true };
    },
  });
  const result = tools("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 2, bars: 2 }] });
  assert.ok(result.ok && result.written, JSON.stringify(result));
  const tempo = result.tempo as { bpm: number; readFrom: string };
  assert.ok(Math.abs(tempo.bpm - 90) <= 3, `read ${tempo.bpm} BPM`);
  const bars = describeScore(session.score).bars.map((bar) => bar.events.map((e) => e.pitch).join(" "));
  assert.deepEqual(bars.slice(1, 3), ["C4 E4 G4 E4", "D4 F4 A4"]);
});

test("a breath between sung phrases does not cut the first phrase off the singing", () => {
  const speech = talking(4);
  const pause = singMelody([{ midi: null, beats: 1 }], { bpm: 120 });
  const firstPhrase = singMelody(phrase.slice(0, 4), { bpm: 120 });
  const breath = singMelody([{ midi: null, beats: 0.75 }], { bpm: 120 });
  const secondPhrase = singMelody(phrase.slice(4), { bpm: 120 });
  const signal = join(speech, pause, firstPhrase, breath, secondPhrase);
  const take = createTake(signal, [
    { start: 0, end: signal.samples.length / signal.sampleRate, text: "we're gonna sing" },
  ]);
  const singingStarts = (speech.samples.length + pause.samples.length) / speech.sampleRate;
  // The synthetic voice's attack takes a moment to be heard as pitched.
  const ATTACK = 0.3;
  assert.equal(take.sung.length, 1);
  assert.ok(Math.abs(take.sung[0].start - singingStarts) < ATTACK, `span starts at ${take.sung[0].start}`);
});

test("suggested chords are written straight away, replacing the wrong ones (the turn can be undone)", () => {
  let session = createSession(createExample());
  session = execute(session, {
    requestId: "wrong",
    expectedRevision: 0,
    operation: { type: "putChord", measureId: "bar-1", beat: 0, symbol: "Bb" },
  });
  const tools = createMusicTools(null, {
    getScore: () => session.score,
    commit: (operation) => {
      session = execute(session, { requestId: "fit", expectedRevision: session.score.revision, operation });
      return { ok: true };
    },
  });
  const result = tools("music_suggest_chords", { fromBar: 1, toBar: 4 });
  assert.ok(result.ok && result.written, JSON.stringify(result));
  const chords = describeScore(session.score).bars.map((bar) => bar.chords.map((c) => c.symbol).join(" "));
  assert.equal(chords.length, 4);
  assert.ok(!chords.includes("Bb") && chords[0] === "C" && chords[3] === "C", chords.join(" | "));
});

test("singing with no bar named continues the piece after its last notes, each span after the previous", () => {
  const take = createTake(
    join(
      singMelody(phrase, { bpm: 120 }),
      singMelody([{ midi: null, beats: 4 }], { bpm: 120 }),
      singMelody(phrase, { bpm: 120 }),
    ),
    [],
  );
  let session = createSession(createExample());
  let edits = 0;
  const tools = createMusicTools(take, {
    getScore: () => session.score,
    commit: (operation) => {
      const requestId = `take-${++edits}`;
      session = execute(session, { requestId, expectedRevision: session.score.revision, operation });
      return { ok: true };
    },
  });
  const result = tools("voice_transcribe_melody", { spans: [{ spanId: "sung-1" }, { spanId: "sung-2" }] });
  assert.ok(result.ok, JSON.stringify(result));
  const firstBars = (result.spans as { bars: Record<string, string> }[]).map((span) => Object.keys(span.bars)[0]);
  // The example's notes end in bar 4: the singing goes to bars 5–6, then 7–8.
  assert.deepEqual(firstBars, ["bar 5", "bar 7"]);
  assert.equal(describeScore(session.score).bars[0].events[0].pitch, "C4");
});

test("syllables the recognizer wrote down for the singing are not shown as words", () => {
  const speech = talking(4);
  const pause = singMelody([{ midi: null, beats: 1 }], { bpm: 120 });
  const signal = join(speech, pause, singMelody(phrase, { bpm: 120 }));
  const end = signal.samples.length / signal.sampleRate;
  const take = createTake(signal, [{ start: 0, end, text: "it's going to be like ping ping ping ping ping" }]);
  assert.deepEqual(takeParts(take.speech, take.sung), [
    { kind: "said", text: "it's going to be like" },
    { kind: "sang", seconds: take.sung[0].end - take.sung[0].start },
  ]);
});

test("words far from any singing are kept as said, even repeated ones", () => {
  const take = createTake(talking(3), [{ start: 0, end: 2.5, text: "no, no, no, not that bar" }]);
  assert.equal(take.speech[0].text, "no, no, no, not that bar");
});

test("talking and singing in turns reads in the order it happened", () => {
  const parts = takeParts(
    [
      { start: 0, end: 2, text: "first bar like" },
      { start: 6, end: 7, text: "then" },
    ],
    [
      { id: "sung-1", start: 2.5, end: 5.5 },
      { id: "sung-2", start: 7.5, end: 9 },
    ],
  );
  assert.deepEqual(
    parts.map((part) => (part.kind === "said" ? part.text : `♪${part.seconds}`)),
    ["first bar like", "♪3", "then", "♪1.5"],
  );
});

/** Sung syllables on one pitch each, detached: "ting · ting · ting", as short as words are. */
const syllables = (count: number) =>
  singMelody(
    Array.from({ length: count }, (_, i) => [
      { midi: midi("G3") + (i % 2) * 2, beats: 0.25 },
      { midi: null, beats: 0.25 },
    ]).flat(),
    { bpm: 100 },
  );

test("detached sung syllables the recognizer wrote as a turn of their own are singing", () => {
  const speech = talking(3);
  const pause = singMelody([{ midi: null, beats: 1 }], { bpm: 120 });
  const sung = syllables(5);
  const signal = join(speech, pause, sung);
  const singingStarts = (speech.samples.length + pause.samples.length) / speech.sampleRate;
  const end = signal.samples.length / signal.sampleRate;
  const take = createTake(signal, [
    { start: 0, end: speech.samples.length / speech.sampleRate, text: "make it like this" },
    { start: singingStarts, end, text: "ting ting ting ting ting" },
  ]);
  assert.equal(take.sung.length, 1);
  assert.ok(Math.abs(take.sung[0].start - singingStarts) < 0.3, `span starts at ${take.sung[0].start}`);
  assert.deepEqual(
    takeParts(take.speech, take.sung).map((part) => (part.kind === "said" ? part.text : "♪")),
    ["make it like this", "♪"],
  );
});

test("sung syllables at the end of a spoken turn, with no pause before them, are singing", () => {
  const speech = talking(3);
  const signal = join(speech, syllables(5));
  const singingStarts = speech.samples.length / speech.sampleRate;
  const end = signal.samples.length / signal.sampleRate;
  const take = createTake(signal, [{ start: 0, end, text: "so if you're gonna add da da da da da" }]);
  assert.equal(take.sung.length, 1);
  assert.ok(Math.abs(take.sung[0].start - singingStarts) < 0.45, `span starts at ${take.sung[0].start}`);
  assert.equal(take.speech[0].text, "so if you're gonna add");
});

test("syllables written into the turn before the singing they stand for are not sung twice", () => {
  const speech = talking(4);
  const pause = singMelody([{ midi: null, beats: 3 }], { bpm: 120 });
  const talkingEnds = speech.samples.length / speech.sampleRate;
  const take = createTake(join(speech, pause, singMelody(phrase, { bpm: 120 })), [
    { start: 0, end: talkingEnds, text: `it's going to be like ${"ping ".repeat(16)}` },
  ]);
  assert.equal(take.sung.length, 1);
  assert.ok(take.sung[0].start >= talkingEnds, `span starts at ${take.sung[0].start}`);
});
