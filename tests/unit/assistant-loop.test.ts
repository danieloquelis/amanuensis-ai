import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleAssistantRequest,
  MAX_TOOL_STEPS,
  musicianName,
  runAssistant,
  type ChatMessage,
  type ModelPort,
  type ModelReply,
} from "@/modules/assistant";
import {
  barEvents,
  beats,
  createExample,
  createSession,
  execute,
  executeAll,
  midiPitch,
  numberedVoice,
  scoreText,
  writeBars,
} from "@/modules/score";
import { createTake, type VoiceTake } from "@/modules/voice";
import { midi, singMelody } from "../support/synthetic-voice";

/** A model that plays back scripted replies and records what it was shown. */
function scriptedModel(replies: ModelReply[]) {
  const seen: ChatMessage[][] = [];
  const offered: string[][] = [];
  const model: ModelPort = {
    async complete(messages, tools) {
      seen.push(structuredClone(messages));
      offered.push(tools.map((tool) => tool.name));
      return replies.shift() ?? { content: "Done.", toolCalls: [] };
    },
  };
  return { model, seen, offered };
}

const call = (name: string, args: unknown, id = name) => ({ id, name, arguments: JSON.stringify(args) });
const request = (instruction: string) => ({ instruction, score: createExample(), selectedIds: [], history: [] });
const chordEdit = {
  requestId: "chord",
  expectedRevision: 0,
  operation: { type: "putChord", measureId: "bar-2", beat: 2, symbol: "Am7" },
};

test("a turn reads the score, edits it, and returns the commands it committed", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_get_context", { selectedIds: [] })] },
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: "Added Am7 on beat 3 of bar 2.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, request("Add Am7 on beat 3 of bar 2"), "t1");
  assert.equal(result.reply, "Added Am7 on beat 3 of bar 2.");
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].requestId, "t1-chord");
  assert.deepEqual(result.changes, ["Bar 2: changed"]);
});

test("the editor replays a turn's commands as one undo step", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    {
      content: null,
      toolCalls: [
        call("score_edit", {
          ...chordEdit,
          requestId: "slash",
          expectedRevision: 1,
          operation: { type: "setMeasureStyle", measureId: "bar-3", style: "slashes" },
        }),
      ],
    },
  ]);
  const { commands } = await runAssistant(model, request("chord, then slashes"), "t2");
  const before = createSession(createExample());
  const after = executeAll(before, commands);
  assert.equal(after.score.revision, 2);
  assert.equal(after.past.length, 1, "one undo step for the whole turn");
});

test("a rejected edit goes back to the model, which can correct itself", async () => {
  const { model, seen } = scriptedModel([
    {
      content: null,
      toolCalls: [call("score_edit", { ...chordEdit, operation: { ...chordEdit.operation, measureId: "bar-99" } })],
    },
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: "Added Am7.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, request("Add Am7"), "t3");
  const feedback = seen[1].at(-1) as { role: string; content: string };
  assert.equal(feedback.role, "tool");
  assert.match(feedback.content, /no longer in the score/);
  assert.equal(result.commands.length, 1);
});

test("an unclear instruction ends with one question and tappable choices", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("assistant_ask", { question: "Which bar?", choices: ["Bar 1", "Bar 2"] })] },
  ]);
  const result = await runAssistant(model, request("repeat that"), "t4");
  assert.deepEqual(result.question, { text: "Which bar?", choices: ["Bar 1", "Bar 2"] });
  assert.equal(result.commands.length, 0);
});

test("an undo inside the turn removes the undone command", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: null, toolCalls: [call("score_undo", { expectedRevision: 1 })] },
    { content: "Never mind.", toolCalls: [] },
  ]);
  assert.equal((await runAssistant(model, request("try"), "t5")).commands.length, 0);
});

test("edits after an undo in the turn still replay in the editor, as one step from the request", async () => {
  // Each edit names the server's revision; the undo made one more there, which the replay never sees.
  const chord = (requestId: string, beat: number, symbol: string, expectedRevision: number) => ({
    requestId,
    expectedRevision,
    operation: { type: "putChord", measureId: "bar-2", beat, symbol },
  });
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_edit", chord("a", 0, "C", 0))] },
    { content: null, toolCalls: [call("score_edit", chord("b", 2, "Am7", 1))] },
    { content: null, toolCalls: [call("score_undo", { expectedRevision: 2 })] },
    { content: null, toolCalls: [call("score_edit", chord("c", 2, "F", 3))] },
    { content: "Added C and F.", toolCalls: [] },
  ]);
  const score = createExample();
  const result = await runAssistant(model, { ...request("chords"), score }, "t7");
  assert.equal(result.commands.length, 2);
  const replayed = executeAll(createSession(score), result.commands).score;
  assert.deepEqual(
    replayed.chords.map((c) => `${c.root.step}${c.quality}@${c.beat}`),
    ["C@0", "F@2"],
  );
});

test("an edit the model sends twice is made once, and the turn still replays", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: "Added Am7.", toolCalls: [] },
  ]);
  const score = createExample();
  const result = await runAssistant(model, { ...request("a chord"), score }, "t8");
  assert.equal(result.commands.length, 1);
  assert.equal(executeAll(createSession(score), result.commands).score.chords.length, 1);
});

test("a model that never stops is cut off at the step limit", async () => {
  const forever: ModelPort = {
    async complete() {
      return { content: null, toolCalls: [call("score_get_context", { selectedIds: [] })] };
    },
  };
  assert.equal((await runAssistant(forever, request("loop"), "t6")).steps, MAX_TOOL_STEPS);
});

test("the selection and recent turns reach the model", async () => {
  const { model, seen } = scriptedModel([{ content: "Ok.", toolCalls: [] }]);
  await runAssistant(model, {
    ...request("make it softer"),
    selectedIds: ["note-0-1"],
    selectionName: "E4 · bar 1",
    history: [{ instruction: "add a dynamic", reply: "Added mf." }],
  });
  const roles = seen[0].map((m) => m.role);
  assert.deepEqual(roles, ["system", "user", "assistant", "user"]);
  assert.match((seen[0].at(-1) as { content: string }).content, /\[Selected: E4 · bar 1: 1#2\]/);
});

test("text and repeats can be the selection the agent reads", async () => {
  const score = executeAll(createSession(createExample()), [
    {
      requestId: "t",
      expectedRevision: 0,
      operation: { type: "putAnnotation", targetId: "bar-2", kind: "text", text: "Fine" },
    },
  ]).score;
  const textId = score.annotations[0].id;
  const { model, seen } = scriptedModel([
    { content: null, toolCalls: [call("score_get_context", { selectedIds: [textId] })] },
    { content: "Ok.", toolCalls: [] },
  ]);
  await runAssistant(model, { ...request("make this bigger"), score, selectedIds: [textId] });
  assert.match((seen[1].at(-1) as { content: string }).content, /"ok":true/);
});

test("an invalid request is rejected without calling the model", async () => {
  const { model, seen } = scriptedModel([]);
  const response = await handleAssistantRequest({ instruction: "", score: createExample() }, model);
  assert.equal(response.status, 400);
  assert.equal(seen.length, 0);
});

test("a model failure becomes a 502 with a readable message", async () => {
  const failing: ModelPort = {
    async complete() {
      throw new Error("The model request failed (429)");
    },
  };
  const response = await handleAssistantRequest({ instruction: "hi", score: createExample() }, failing);
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, { error: "The model request failed (429)" });
});

test("a voice turn shows the take as a timeline and offers the voice tools", async () => {
  const take: VoiceTake = {
    signal: { samples: new Float32Array(24_000 * 6), sampleRate: 24_000 },
    speech: [{ start: 0, end: 2, text: "Allegro, over Em A D G" }],
    sung: [{ id: "sung-1", start: 2.5, end: 6 }],
    voice: [],
  };
  const { model, seen, offered } = scriptedModel([{ content: "Ok.", toolCalls: [] }]);
  await runAssistant(model, { ...request(""), take });
  const message = (seen[0].at(-1) as { content: string }).content;
  assert.match(message, /said: "Allegro, over Em A D G"/);
  assert.match(message, /sang: sung-1/);
  assert.ok(offered[0].includes("voice_transcribe_melody"));
});

test("a text turn offers music analysis but not the voice tools", async () => {
  const { model, seen, offered } = scriptedModel([
    { content: null, toolCalls: [call("music_infer_key", { chords: ["Em", "A", "D", "G"] })] },
    { content: "D major.", toolCalls: [] },
  ]);
  await runAssistant(model, request("What key is Em A D G?"));
  assert.ok(offered[0].includes("music_infer_key"));
  assert.ok(!offered[0].includes("voice_transcribe_melody"));
  assert.match((seen[1].at(-1) as { content: string }).content, /D major/);
});

test("progress is reported as the agent thinks and uses each tool, never with its wording", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_get_context", { selectedIds: [] })] },
    { content: "Ok.", toolCalls: [] },
  ]);
  const events: unknown[] = [];
  await runAssistant(model, request("hi"), "t9", (event) => events.push(event));
  assert.deepEqual(events, [
    { stage: "thinking" },
    { stage: "tool", tool: "score_get_context" },
    { stage: "thinking" },
  ]);
});

test("each model call and each tool run is timed, so a slow turn shows where its time went", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_get_context", { selectedIds: [] })] },
    { content: "Ok.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, request("hi"));
  assert.equal(result.thinkingMs.length, 2);
  assert.ok(result.trace.every((entry) => typeof entry.ms === "number"));
});

test("the request carries the score, so the agent can act in its first step", async () => {
  const { model, seen } = scriptedModel([{ content: "Ok.", toolCalls: [] }]);
  await runAssistant(model, { ...request("make bar 2 louder"), selectedIds: ["bar-2"] });
  const message = (seen[0].at(-1) as { content: string }).content;
  assert.match(message, /\[Score context, as score_get_context returns it\]/);
  assert.match(message, /\[Selected: 2\]/);
  assert.match(message, /^bar 2: D4q F4e G4e A4h$/m);
});

test("transcribing a take again at another tempo rewrites its bars instead of adding a second copy", async () => {
  // Eight quarters at 120: two bars; read at half the tempo they become eighths in one bar.
  const sung = singMelody(
    ["C4", "E4", "G4", "E4", "D4", "F4", "A4", "G4"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const transcribe = (bpm: number) =>
    call("voice_transcribe_melody", { spans: [{ spanId: "sung-1" }], bpm, write: true });
  const { model } = scriptedModel([
    { content: null, toolCalls: [transcribe(120)] },
    { content: null, toolCalls: [transcribe(60)] },
    { content: "Done.", toolCalls: [] },
  ]);
  const blank = executeAll(createSession(createExample()), [
    {
      requestId: "blank",
      expectedRevision: 0,
      operation: {
        type: "batch",
        operations: ["bar-1", "bar-2", "bar-3", "bar-4"].map((measureId) => ({
          type: "clearMeasure" as const,
          measureId,
        })),
      },
    },
  ]).score;
  const result = await runAssistant(model, { ...request(""), score: blank, take });
  const after = executeAll(createSession(blank), result.commands).score;
  const notes = after.measures.map((m) => barEvents(m).filter((e) => e.pitch).length);
  // One copy, in bar 1 (the second reading's), and bar 2 back to rest: nothing left from the first.
  assert.equal(notes[0], 8, `notes per bar ${notes}`);
  assert.deepEqual(notes.slice(1), [0, 0, 0]);
});

test("what was just sung stays as heard: the agent cannot rewrite those notes in the same turn", async () => {
  const sung = singMelody(
    ["C4", "E4", "G4", "E4", "D4", "F4", "A4"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const rewrite = { type: "replaceMeasure", measureId: "bar-1", events: [{ duration: 4, pitch: null }] };
  const chord = { type: "putChord", measureId: "bar-1", beat: 0, symbol: "C" };
  const { model, seen } = scriptedModel([
    {
      content: null,
      toolCalls: [call("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 1 }], bpm: 120 })],
    },
    { content: null, toolCalls: [call("score_edit", { requestId: "x", expectedRevision: 1, operation: rewrite })] },
    { content: null, toolCalls: [call("score_edit", { requestId: "y", expectedRevision: 1, operation: chord })] },
    { content: "Done.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request(""), take });
  const refusal = (seen[2].at(-1) as { content: string }).content;
  assert.match(refusal, /hold what the musician just sang/);
  assert.deepEqual(
    result.trace.map((entry) => [entry.tool, entry.ok]),
    [
      ["voice_transcribe_melody", true],
      ["score_edit", false],
      ["score_edit", true],
    ],
  );
});

test("the musician can still ask for changes to what they just sang, quoted from their words", async () => {
  const sung = singMelody(
    ["C4", "E4", "G4", "E4"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const lastNoteUp = { type: "replaceMeasure", measureId: "bar-1", events: [{ duration: 4, pitch: null }] };
  const edit = (asked: string) =>
    call("score_edit", { requestId: asked, expectedRevision: 1, operation: lastNoteUp, asked });
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: [call("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 1 }], bpm: 120 })],
    },
    { content: null, toolCalls: [edit("the melody should be smoother")] },
    { content: null, toolCalls: [edit("Make the last note an octave higher")] },
    { content: "Done.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request("and make the last note an octave higher, please"), take });
  assert.deepEqual(
    result.trace.map((entry) => entry.ok),
    [true, false, true],
  );
});

test("a second voice under what was just sung is another line, so writing it is allowed", async () => {
  const sung = singMelody(
    ["C4", "E4", "G4", "E4"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const bass = {
    type: "batch",
    operations: [
      { type: "addVoiceBars", voice: 2, measureIds: ["bar-1"] },
      {
        type: "replaceMeasure",
        measureId: "bar-1",
        voiceId: "v2",
        events: [{ duration: 4, pitch: { step: "C", alter: 0, octave: 3 } }],
      },
    ],
  };
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: [call("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 1 }], bpm: 120 })],
    },
    { content: null, toolCalls: [call("score_edit", { requestId: "bass", expectedRevision: 1, operation: bass })] },
    { content: "Done.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request(""), take });
  assert.deepEqual(
    result.trace.map((entry) => entry.ok),
    [true, true],
  );
});

test("a sung span can be written into the second voice, under the melody", async () => {
  const sung = singMelody(
    ["C3", "G2", "A2", "E2"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: [
        call("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 1, bars: 1, voice: "v2" }], bpm: 120 }),
      ],
    },
    { content: "Done.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request(""), take });
  assert.equal(result.trace[0].ok, true);
  const { score } = executeAll(createSession(createExample()), result.commands);
  const bass = barEvents(score.measures[0], numberedVoice(score, 2)!);
  assert.ok(
    bass.some((e) => e.pitch && midiPitch(e.pitch) < midi("C4")),
    "the bass went into voice 2",
  );
  assert.deepEqual(
    barEvents(score.measures[0]).map((e) => e.id),
    barEvents(createExample().measures[0]).map((e) => e.id),
    "the melody is untouched",
  );
});

test("singing over a bar whose rhythm is right changes only its notes", async () => {
  // Bar 2 of the example is D4 quarter, F4 G4 eighths, A4 half; the take sings other notes, evenly.
  const sung = singMelody(
    ["E4", "G4", "C5", "B4"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const transcribe = { spans: [{ spanId: "sung-1", bar: 2, bars: 1 }], bpm: 120, keep: "rhythm" };
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("voice_transcribe_melody", transcribe)] },
    { content: "Took the notes from your voice.", toolCalls: [] },
  ]);
  const score = createExample();
  const result = await runAssistant(model, { ...request("keep the rhythm"), score, take });
  const bar = barEvents(executeAll(createSession(score), result.commands).score.measures[1]);
  assert.deepEqual(
    bar.map((event) => beats(event.duration)),
    [1, 0.5, 0.5, 2],
    "the rhythm stays",
  );
  assert.deepEqual(
    bar.map((event) => event.pitch?.step),
    ["E", "G", "C", "B"],
    "the notes are the sung ones",
  );
});

test("a bar that breaks a sung figure can be made to repeat it, but heard notes take nothing else", async () => {
  // Bar 2 sings bar 1's figure again with one note changed (F for E): the singing supports E there.
  const sung = singMelody(
    ["C4", "D4", "E4", "C4", "C4", "D4", "F4", "C4"].map((name) => ({ midi: midi(name), beats: 1 })),
    { bpm: 120 },
  );
  const take = createTake(sung, []);
  const transcribe = { spans: [{ spanId: "sung-1", bar: 1 }], bpm: 120, key: { fifths: 0, mode: "major" } };
  const setPitch = (requestId: string, eventId: string, step: string) =>
    call("score_edit", {
      requestId,
      expectedRevision: 1,
      operation: { type: "setPitch", eventId, pitch: { step, alter: 0, octave: 4 } },
    });
  const { model, seen } = scriptedModel([
    { content: null, toolCalls: [call("voice_transcribe_melody", transcribe)] },
    { content: null, toolCalls: [setPitch("repeat", "2#3", "E")] },
    { content: null, toolCalls: [setPitch("invented", "2#4", "G")] },
    { content: "Bar 2 now repeats bar 1.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request(""), take });
  const transcribed = (seen[1].at(-1) as { content: string }).content;
  assert.match(transcribed, /bar 2 repeats bar 1's figure except beat 3 F4 where it gives E4/);
  assert.deepEqual(
    result.trace.map((entry) => [entry.tool, entry.ok]),
    [
      ["voice_transcribe_melody", true],
      ["score_edit", true],
      ["score_edit", false],
    ],
  );
});

test("the agent shows its plan as it works, and keeps notes on the song and what it learns about the musician", async () => {
  const plan = (done: boolean) =>
    call("assistant_plan", {
      steps: [
        { text: "Chords for bar 2", done },
        { text: "Notes for next time", done: false },
      ],
    });
  const { model, seen } = scriptedModel([
    { content: null, toolCalls: [plan(false)] },
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: null, toolCalls: [plan(true)] },
    { content: null, toolCalls: [call("song_notes_write", { text: "Key C. Bar 2 harmonized with Am7." })] },
    { content: null, toolCalls: [call("musician_remember", { fact: "Likes seventh chords" })] },
    { content: "Added Am7 and noted it.", toolCalls: [] },
  ]);
  const plans: string[] = [];
  const result = await runAssistant(
    model,
    { ...request("harmonize bar 2"), songNotes: "Song in C.", memory: ["Sings slightly flat"] },
    "t9",
    (event) => {
      if (event.stage === "plan") plans.push(event.steps.map((s) => (s.done ? "✓" : "·")).join(""));
    },
  );
  // What it knew before came with the request.
  const opening = JSON.stringify(seen[0]);
  assert.match(opening, /Song in C\./);
  assert.match(opening, /Sings slightly flat/);
  assert.deepEqual(plans, ["··", "✓·"]);
  assert.deepEqual(
    result.plan?.map((s) => s.done),
    [true, false],
  );
  assert.equal(result.songNotes, "Key C. Bar 2 harmonized with Am7.");
  assert.deepEqual(result.memory, ["Sings slightly flat", "Likes seventh chords"]);
});

test("checking a take finds a note struck without a pitch, and the bars may be rewritten to include it, but nothing else", async () => {
  // E4, a rest with a short unpitched strike in it (a muted pluck), then E4 G4: three E's played, two heard.
  const spec = [
    { midi: midi("E4"), beats: 1 },
    { midi: null, beats: 1 },
    { midi: midi("E4"), beats: 1 },
    { midi: midi("G4"), beats: 1 },
  ];
  const sung = singMelody(spec, { bpm: 120 });
  const strike = Math.round(0.7 * sung.sampleRate);
  for (let i = 0; i < 0.04 * sung.sampleRate; i++) sung.samples[strike + i] += 0.4 * (Math.random() * 2 - 1);
  const take = createTake(sung, []);
  const write = (requestId: string, text: string) =>
    call("score_write", { requestId, expectedRevision: 1, text }, requestId);
  const { model, seen } = scriptedModel([
    {
      content: null,
      toolCalls: [call("voice_transcribe_melody", { spans: [{ spanId: "sung-1", bar: 1 }], bpm: 120 })],
    },
    { content: null, toolCalls: [call("voice_check", {})] },
    { content: null, toolCalls: [write("invented", "bar 1: E4q C5q E4q G4q")] },
    { content: null, toolCalls: [write("repeat", "bar 1: E4q E4q E4q G4q")] },
    { content: "Added the E you played softly.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request(""), take });
  const check = (seen[2].at(-1) as { content: string }).content;
  assert.match(check, /probably another E4/);
  assert.deepEqual(
    result.trace.map((entry) => [entry.tool, entry.ok]),
    [
      ["voice_transcribe_melody", true],
      ["voice_check", true],
      ["score_write", false],
      ["score_write", true],
    ],
  );
});

test("in Band Mode the band plays in rehearsal order, then rehearses, each only its own part, as one undo step", async () => {
  const { model, seen } = scriptedModel([
    // The bandleader hands out the parts (bass named first: the band still lines up drums first).
    {
      content: null,
      toolCalls: [
        call("band_arrange", {
          style: "jazz",
          feel: "a gentle waltz",
          form: [{ from: 1, to: 4, name: "Head", plan: "the tune, mp" }],
          parts: [
            { part: "bass", brief: "roots on 1" },
            { part: "drums", brief: "brushes" },
          ],
          tune: [{ from: 1, to: 4, parts: ["piano"] }],
        }),
      ],
    },
    // Both play their first pass at once, their replies interleaved: the drummer, with a word for
    // the bassist; the bassist, trying the piano first (refused).
    {
      content: null,
      toolCalls: [
        call("score_edit", {
          requestId: "groove",
          expectedRevision: 2,
          operation: { type: "putGroove", partId: "drums", groove: "rock", measureIds: ["1"] },
        }),
        call("band_note", { to: musicianName("bass", "bass"), note: "Land with my kick on 1." }),
      ],
    },
    { content: null, toolCalls: [call("score_write", { requestId: "b1", expectedRevision: 3, text: "bar 1: C2w" })] },
    { content: "Rock groove in bar 1.", toolCalls: [] },
    // Then its whole part in one reply: the bars, and a dynamic on its own note (the bassist's to add).
    {
      content: null,
      toolCalls: [
        call("score_write", { requestId: "b2", expectedRevision: 3, text: "bar 1 bass: C2w" }, "b2"),
        call(
          "score_edit",
          {
            requestId: "b3",
            expectedRevision: 3,
            operation: { type: "putAnnotation", targetId: "bass/1#1", kind: "dynamic", text: "mf" },
          },
          "b3",
        ),
      ],
    },
    { content: "Root on 1.", toolCalls: [] },
    // The rehearsal: everyone hears the band at once; the drummer answers the bassist, who keeps its part.
    { content: null, toolCalls: [call("band_note", { to: musicianName("bass", "bass"), note: "Locked, thanks." })] },
    { content: "Kept my root: it lands with the kick.", toolCalls: [] },
    { content: "Kept the groove.", toolCalls: [] },
    // The bandleader listens and replies.
    { content: null, toolCalls: [call("band_listen", {})] },
    { content: "The band played bar 1.", toolCalls: [] },
  ]);
  const score = createExample();
  const progress: string[] = [];
  const result = await runAssistant(
    model,
    { ...request("arrange it"), score, band: { on: true }, memory: ["The bassist reads treble clef"] },
    "t10",
    (event) => {
      if (event.stage === "musician" && event.state !== "playing") progress.push(`${event.name} ${event.state}`);
    },
  );
  const [drummer, bassist] = [musicianName("drums", "drums"), musicianName("bass", "bass")];
  assert.deepEqual(progress, [
    `${drummer} waiting`,
    `${bassist} waiting`,
    `${drummer} done`,
    `${bassist} done`,
    `${drummer} waiting`,
    `${bassist} waiting`,
    `${bassist} done`,
    `${drummer} done`,
  ]);
  // Each musician's last word is from the rehearsal; what they said to each other is kept.
  assert.deepEqual(
    result.band?.map((r) => [r.name, r.report]),
    [
      [drummer, "Kept the groove."],
      [bassist, "Kept my root: it lands with the kick."],
    ],
  );
  assert.deepEqual(
    result.bandNotes?.map((n) => [n.from, n.to, n.note]),
    [
      [drummer, bassist, "Land with my kick on 1."],
      [drummer, bassist, "Locked, thanks."],
    ],
  );
  // In the rehearsal the bassist heard the whole band and read the drummer's note.
  assert.match(JSON.stringify(seen[7]), /Rehearsal, round 1/);
  assert.match(JSON.stringify(seen[7]), /lands with the kick on/);
  assert.match(JSON.stringify(seen[7]), /Notes for you:\\n- [A-Za-z]+: Land with my kick on 1/);
  // The bassist has its name and what the agent knows about the band; its try at the piano was refused.
  assert.match(JSON.stringify(seen[2]), new RegExp(`You are ${bassist}, the band's Bass`));
  assert.match(JSON.stringify(seen[2]), /The bassist reads treble clef/);
  assert.match(JSON.stringify(seen[4].at(-1)), /You play Bass/);
  const after = executeAll(createSession(score), result.commands).score;
  assert.deepEqual(
    after.parts.map((p) => p.instrument),
    ["piano", "bass", "drums"],
  );
  assert.equal(executeAll(createSession(score), result.commands).past.length, 1, "one undo step");
  // Every model call of the turn is counted, the musicians' too: 3 by the bandleader, 2 + 2 drums, 3 + 1 bass.
  assert.equal(result.thinkingMs.length, 11);
  // Only the bassist's try at the piano was refused; its own dynamic was not.
  assert.deepEqual(
    result.trace.filter((entry) => !entry.ok).map((entry) => entry.tool),
    ["bass: score_write"],
  );
});

test("a song with a tune is arranged only with a plan for it; a piano keeping the tune comps on a left hand", async () => {
  const form = [{ from: 1, to: 4, name: "Verse", plan: "the tune over the band, mf" }];
  const parts = [
    { part: "trumpet", brief: "answer the tune" },
    { part: "piano", brief: "comp the chords" },
  ];
  const { model, seen } = scriptedModel([
    { content: null, toolCalls: [call("band_arrange", { style: "pop", feel: "a ballad", form, parts })] },
    {
      content: null,
      toolCalls: [
        call("band_arrange", {
          style: "pop",
          feel: "a ballad",
          form,
          parts,
          tune: [{ from: 1, to: 4, parts: ["piano"] }],
        }),
      ],
    },
    { content: "Comped.", toolCalls: [] },
    { content: "Answered the tune.", toolCalls: [] },
    { content: "Kept my comping.", toolCalls: [] },
    { content: "Kept my answers.", toolCalls: [] },
    { content: "Done.", toolCalls: [] },
  ]);
  const score = createExample();
  const result = await runAssistant(model, { ...request("arrange it"), score, band: { on: true } }, "t11");
  assert.match(result.trace[0].error ?? "", /The song has a tune \(on piano\)\. Say how it moves through the band/);
  // The piano plays first (harmony before lead lines), keeps the tune and gets a left hand to comp on.
  assert.match(JSON.stringify(seen[2]), /You carry it in bars 1–4/);
  assert.match(JSON.stringify(seen[2]), /left-hand staff to comp on/);
  assert.match(JSON.stringify(seen[3]), /The tune, as planned: bars 1–4: piano/);
  const after = executeAll(createSession(score), result.commands).score;
  assert.equal(after.parts[0].staves.length, 2, "a left-hand staff for the comping");
});

test("on a later turn the band in the song takes the composer's comments as the bandleader's notes", async () => {
  const session = createSession(createExample());
  const add = { type: "addPart", instrument: "bass" } as const;
  const score = execute(session, { requestId: "add", expectedRevision: session.score.revision, operation: add }).score;
  const [pianist, bassist] = [musicianName("piano", "piano"), musicianName("bass", "bass")];
  const { model, seen } = scriptedModel([
    // A round without notes has nothing to pass on; with them, the band already in the song plays it.
    { content: null, toolCalls: [call("band_rehearse", {})] },
    {
      content: null,
      toolCalls: [
        call("band_rehearse", { feel: "a driving fugue", notes: [{ to: bassist, note: "Walk in eighths in bar 1." }] }),
      ],
    },
    // Only the bassist has a note: the pianist sits the round out.
    { content: "Walking in eighths now.", toolCalls: [] },
    { content: "The bass walks now.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request("more drive"), score, band: { on: true } }, "t13");
  // The bandleader knows the band by name, and that comments go to them.
  assert.match(
    JSON.stringify(seen[0]),
    new RegExp(`The band in the song: ${pianist} \\(piano\\), ${bassist} \\(bass\\)`),
  );
  assert.match(result.trace[0].error ?? "", /Tell the musicians what to change/);
  // The bassist plays from its part as it stands, in the feel given, with the bandleader's note.
  const brief = JSON.stringify(seen[2]);
  assert.match(brief, /The band's feel: a driving fugue/);
  assert.match(brief, /Your part as it stands in the song/);
  assert.match(brief, /Notes for you:\\n- Bandleader: Walk in eighths in bar 1\./);
  assert.deepEqual(
    result.bandNotes?.map((n) => [n.from, n.to]),
    [["Bandleader", bassist]],
  );
  assert.deepEqual(
    result.band?.map((r) => [r.name, r.report]),
    [[bassist, "Walking in eighths now."]],
  );
});

test("musicians grow their parts from the bandleader's material, developed exactly with band_motif", async () => {
  const { model, seen } = scriptedModel([
    {
      content: null,
      toolCalls: [
        call("band_arrange", {
          style: "baroque",
          feel: "a little invention",
          form: [{ from: 1, to: 4, name: "Exposition", plan: "the motif, then the cello's answer, mf" }],
          material: [{ name: "motif", part: "piano", from: 1, to: 1, about: "the head" }],
          tune: [{ from: 1, to: 4, parts: ["piano"] }],
          parts: [{ part: "cello", brief: "answer the motif an octave down in bar 2" }],
        }),
      ],
    },
    // The cellist reads the material and plays it an octave down, upside down, from bar 2.
    { content: null, toolCalls: [call("band_motif", { material: "motif", bar: 2, steps: -7, invert: true })] },
    { content: "Answered the motif upside down.", toolCalls: [] },
    { content: "Kept my answer.", toolCalls: [] },
    { content: "The cello answers the motif.", toolCalls: [] },
  ]);
  const score = createExample();
  const result = await runAssistant(model, { ...request("an invention"), score, band: { on: true } }, "t14");
  const brief = JSON.stringify(seen[1]);
  assert.match(brief, /The style: Baroque counterpoint/);
  assert.match(brief, /Exposition: the motif, then the cello's answer/);
  assert.match(brief, /motif \(piano, bar 1\): the head\\nbar 1 piano: C4q E4q G4q E4q/);
  const after = executeAll(createSession(score), result.commands).score;
  // C E G E, mirrored around C and an octave down: C3 A2 F2 A2.
  assert.match(scoreText(after), /bar 2 cello: C3q A2q F2q A2q/);
  assert.deepEqual(
    result.trace.filter((entry) => !entry.ok).map((entry) => entry.tool),
    [],
  );
});

test("material that is only a scale is sent back once, before the band plays on it", async () => {
  const arrange = call("band_arrange", {
    style: "baroque",
    feel: "a fugue",
    form: [{ from: 1, to: 4, name: "Exposition", plan: "the subject, then the answer" }],
    material: [{ name: "subject", part: "piano", from: 1, to: 2 }],
    tune: [{ from: 1, to: 4, parts: ["piano"] }],
    parts: [{ part: "cello", brief: "the answer" }],
  });
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: [
        call("score_write", {
          requestId: "s",
          expectedRevision: 0,
          text: "bar 1: C4q D4q E4q F4q\nbar 2: G4q A4q B4q C5q",
        }),
      ],
    },
    { content: null, toolCalls: [arrange] },
    { content: "The subject needs work.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, { ...request("a fugue"), band: { on: true } }, "t15");
  const refused = result.trace.find((entry) => entry.tool === "band_arrange");
  assert.match(
    refused?.error ?? "",
    /subject \(piano, bars 1–2\): it is mostly a scale; it moves only by step, with no leap; every note is the same length/,
  );
});

test("the song's own tune is never sent back as plain material, however plain", async () => {
  const plain = writeBars(createExample(), "bar 1: C4q D4q E4q F4q\nbar 2: G4q A4q B4q C5q", "plain").score;
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: [
        call("band_arrange", {
          style: "classical",
          feel: "a minuet",
          form: [{ from: 1, to: 4, name: "A", plan: "the tune, then its answer" }],
          material: [{ name: "tune", part: "piano", from: 1, to: 2 }],
          tune: [{ from: 1, to: 4, parts: ["piano"] }],
          parts: [{ part: "cello", brief: "the bass" }],
        }),
      ],
    },
  ]);
  const result = await runAssistant(model, { ...request("arrange it"), score: plain, band: { on: true } }, "t16");
  const arranged = result.trace.find((entry) => entry.tool === "band_arrange");
  assert.equal(arranged?.ok, true, arranged?.error);
});

test("a reply that only promises more work gets one more step to do it", async () => {
  const { model } = scriptedModel([
    { content: null, toolCalls: [call("score_edit", chordEdit)] },
    { content: "Added Am7. I'll verify the bar reads correctly.", toolCalls: [] },
    { content: "Added Am7 to bar 2.", toolCalls: [] },
  ]);
  const result = await runAssistant(model, request("a chord"), "t12");
  assert.equal(result.reply, "Added Am7 to bar 2.");
  assert.equal(result.steps, 3);
});
