import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleAssistantRequest,
  MAX_TOOL_STEPS,
  runAssistant,
  type ChatMessage,
  type ModelPort,
  type ModelReply,
} from "@/modules/assistant";
import { barEvents, createExample, createSession, executeAll, midiPitch, numberedVoice } from "@/modules/score";
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
