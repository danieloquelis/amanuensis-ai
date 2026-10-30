import { test } from "node:test";
import assert from "node:assert/strict";
import { runAssistant, type ModelPort, type ModelReply, type ProgressEvent } from "@/modules/assistant";
import { arrivals, turnPreview } from "@/modules/editor";
import { applyCommand, createExample, executeAll, createSession, type Command } from "@/modules/score";

// An assistant turn shown live: its edits reach the editor as they are made, and the sheet
// previews them exactly as the turn will commit them.

const call = (name: string, args: unknown, id = name) => ({ id, name, arguments: JSON.stringify(args) });
const write = (requestId: string, expectedRevision: number, text: string) =>
  call("score_write", { requestId, expectedRevision, text }, requestId);

function scriptedModel(replies: ModelReply[]): ModelPort {
  return { complete: async () => replies.shift() ?? { content: "Done.", toolCalls: [] } };
}

test("each edit is sent as it is committed, and an undo takes the last one back", async () => {
  const score = createExample();
  const model = scriptedModel([
    { content: null, toolCalls: [write("one", score.revision, "bar 1: G4w")] },
    { content: null, toolCalls: [write("two", score.revision + 1, "bar 2: A4w")] },
    { content: null, toolCalls: [call("score_undo", { expectedRevision: score.revision + 2 })] },
  ]);
  const edits: Extract<ProgressEvent, { stage: "edits" }>[] = [];
  const request = { instruction: "write", score, selectedIds: [], history: [] };
  const result = await runAssistant(model, request, "t", (event) => {
    if (event.stage === "edits") edits.push(event);
  });
  assert.deepEqual(
    edits.map(({ keep, add }) => [keep, add.map((command) => command.requestId)]),
    [
      [0, ["t-one"]],
      [1, ["t-two"]],
      [1, []],
    ],
  );
  // What was sent adds up to what the turn commits.
  assert.deepEqual(
    result.commands.map((command) => command.requestId),
    ["t-one"],
  );
});

test("the preview is the score the turn commits, and drops out when its edits no longer apply", () => {
  const score = createExample();
  const commands: Command[] = [
    {
      requestId: "a",
      expectedRevision: score.revision,
      operation: {
        type: "setPitch",
        eventId: score.measures[0].voices![0].events[0].id,
        pitch: { step: "G", alter: 0, octave: 4 },
      },
    } as Command,
  ];
  const preview = turnPreview(score, commands)!;
  assert.deepEqual(preview, executeAll(createSession(score), commands).score);
  const edited = applyCommand(score, { ...commands[0], requestId: "mine" });
  assert.equal(turnPreview(edited, commands), null);
});

test("notes that arrive or change are listed in the order they appear on the page", () => {
  const before = createExample();
  const [first, second] = before.measures[1].voices![0].events;
  const after = applyCommand(before, {
    requestId: "w",
    expectedRevision: before.revision,
    operation: {
      type: "batch",
      operations: [
        { type: "setPitch", eventId: second.id, pitch: { step: "B", alter: 0, octave: 4 } },
        { type: "setPitch", eventId: first.id, pitch: { step: "A", alter: 0, octave: 4 } },
      ],
    },
  } as Command);
  assert.deepEqual(
    [...arrivals(before, after)],
    [
      [first.id, 0],
      [second.id, 1],
    ],
  );
  assert.equal(arrivals(after, after).size, 0);
});

test("a stopped turn ends before its next step, and the model call in flight is told", async () => {
  const score = createExample();
  const stop = new AbortController();
  const signals: (AbortSignal | undefined)[] = [];
  const model: ModelPort = {
    async complete(_messages, _tools, { signal } = {}) {
      signals.push(signal);
      // The musician presses Stop while the first edit is being made.
      stop.abort();
      return { content: null, toolCalls: [write("one", score.revision, "bar 1: G4w")] };
    },
  };
  const request = { instruction: "write", score, selectedIds: [], history: [] };
  const result = await runAssistant(model, request, "t", undefined, { signal: stop.signal });
  assert.equal(result.reply, "Stopped.");
  assert.equal(signals.length, 1);
  assert.equal(signals[0], stop.signal);
  // What it wrote before stopping is still its to give back.
  assert.deepEqual(
    result.commands.map((command) => command.requestId),
    ["t-one"],
  );
});
