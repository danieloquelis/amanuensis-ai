import { test } from "node:test";
import assert from "node:assert/strict";
import { runAssistant, scoreBlocks, withoutScoreBlocks, type ModelPort, type ProgressEvent } from "@/modules/assistant";
import { withDraft } from "@/modules/editor";
import { createExample, scoreText, writeBars } from "@/modules/score";

// Bars the agent writes in its reply, between <score> tags: drawn while it writes them, written when the block closes.

test("a block being written gives its finished bar lines; a closed one all of them, and how its pitches are given", () => {
  const writing = "Here it is.\n<score>\nbar 1: C4w\nbar 2: D4h E4";
  assert.deepEqual(scoreBlocks(writing), [{ lines: ["bar 1: C4w"], closed: false, pitches: "concert" }]);
  const done = 'One.\n<score pitches="written">\nbar 1: D5w\n</score>\nTwo.\n<score>\nbar 2: C4w\n</score>';
  assert.deepEqual(scoreBlocks(done), [
    { lines: ["bar 1: D5w"], closed: true, pitches: "written" },
    { lines: ["bar 2: C4w"], closed: true, pitches: "concert" },
  ]);
  assert.equal(withoutScoreBlocks(done), "One.\n\nTwo.");
});

/** A model that writes `text` in pieces, as a stream, then calls the given tools. */
function streamingModel(...steps: { pieces: string[]; tools?: { name: string; args: unknown }[] }[]): ModelPort {
  return {
    async complete(_messages, _tools, options = {}) {
      const step = steps.shift() ?? { pieces: ["Done."] };
      for (const piece of step.pieces) options.onText?.(piece);
      const toolCalls = (step.tools ?? []).map((tool, k) => ({
        id: `c${k}`,
        name: tool.name,
        arguments: JSON.stringify(tool.args),
      }));
      return { content: step.pieces.join(""), toolCalls };
    },
  };
}

test("bars written in a block are drawn line by line, then written as one edit, and the reply leaves them out", async () => {
  const model = streamingModel({
    pieces: ["Wrote two bars.\n<score>\nbar 1: G4w\nba", "r 2: A4w\n", "</score>"],
  });
  const events: ProgressEvent[] = [];
  const request = { instruction: "write", score: createExample(), selectedIds: [], history: [] };
  const result = await runAssistant(model, request, "t", (event) => events.push(event));
  const drafts = events.filter((event) => event.stage === "draft").map((event) => event.text);
  assert.deepEqual(drafts, ["bar 1: G4w", "bar 1: G4w\nbar 2: A4w", ""]);
  assert.equal(result.reply, "Wrote two bars.");
  assert.equal(result.steps, 1);
  assert.deepEqual(
    result.commands.map((command) => command.requestId),
    ["t-score-1"],
  );
});

test("a block that cannot be written is reported back, and the agent fixes it", async () => {
  const model = streamingModel(
    { pieces: ["<score>\nbar 1: G4h\n</score>"] },
    { pieces: ["<score>\nbar 1: G4w\n</score>"] },
  );
  const request = { instruction: "write", score: createExample(), selectedIds: [], history: [] };
  const result = await runAssistant(model, request, "t");
  assert.equal(result.steps, 2);
  assert.deepEqual(
    result.commands.map((command) => command.requestId),
    ["t-score-2"],
  );
});

test("drawn bars keep their IDs when they are written, and a line that cannot be written yet waits", () => {
  const score = createExample();
  const draft = { requestId: "t-score-1", text: "bar 1: G4w", pitches: "concert" as const };
  // The block, once closed, is written under the same request ID: the same notes, the same IDs.
  assert.deepEqual(withDraft(score, draft), writeBars(score, draft.text, draft.requestId).score);
  // Bar 2 doesn't add up yet: bar 1 is drawn, bar 2 stays as it was.
  const partial = withDraft(score, { ...draft, text: "bar 1: G4w\nbar 2: A4h" });
  assert.equal(scoreText(partial).split("\n")[2], scoreText(score).split("\n")[2]);
  assert.match(scoreText(partial).split("\n")[1], /bar 1: G4w/);
});
