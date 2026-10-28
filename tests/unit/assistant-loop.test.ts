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
import { createExample, createSession, executeAll } from "@/modules/score";
import type { VoiceTake } from "@/modules/voice";

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
    history: [{ instruction: "add a dynamic", reply: "Added mf." }],
  });
  const roles = seen[0].map((m) => m.role);
  assert.deepEqual(roles, ["system", "user", "assistant", "user"]);
  assert.match((seen[0].at(-1) as { content: string }).content, /Selected IDs: note-0-1/);
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
