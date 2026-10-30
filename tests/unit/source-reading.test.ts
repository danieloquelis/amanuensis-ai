import { test } from "node:test";
import assert from "node:assert/strict";
import { readUploads, runAssistant, type ChatMessage, type ModelPort, type ModelReply } from "@/modules/assistant";
import { allStaves, createExample, staffHandle } from "@/modules/score";
import { drawPage, fakeImages, SPACE } from "../support/synthetic-page";

// The page: E4 G4 | B4 and the chord C5 E5 |, on one treble staff.
const page = drawPage(
  [
    { x: 7 * SPACE, positions: [0] },
    { x: 10 * SPACE, positions: [2] },
    { x: 16 * SPACE, positions: [4] },
    { x: 20 * SPACE, positions: [5, 7] },
  ],
  [13 * SPACE, 26 * SPACE],
);

function scriptedModel(replies: ModelReply[]) {
  const seen: ChatMessage[][] = [];
  const model: ModelPort = {
    async complete(messages) {
      seen.push(structuredClone(messages));
      return replies.shift() ?? { content: "Done.", toolCalls: [] };
    },
  };
  return { model, seen };
}

const call = (name: string, args: unknown) => ({ id: name, name, arguments: JSON.stringify(args) });
const toolResult = (messages: ChatMessage[], id: string) =>
  JSON.parse((messages.findLast((m) => m.role === "tool" && m.toolCallId === id) as { content: string }).content);

test("attached music is read before it is written, the labelled page is shown, and the check finds a misread bar", async () => {
  const score = createExample();
  const staff = staffHandle(score, allStaves(score)[0].id)!;
  const write = (text: string) => call("score_write", { requestId: "w", expectedRevision: score.revision, text });
  const reading = {
    kind: "engraved",
    parts: [{ name: "Piano", instrument: "piano" }],
    bars: 40,
    pages: [{ attachment: 1, clefs: ["treble"] }],
  };
  const { model, seen } = scriptedModel([
    { content: null, toolCalls: [write("bar 1: E4q G4q rh")] },
    { content: null, toolCalls: [call("music_read_source", reading)] },
    // Bar 2's chord misread as C5 D5.
    { content: null, toolCalls: [write("bar 1: E4q G4q rh\nbar 2: B4q <C5 D5>q rh")] },
    { content: null, toolCalls: [call("page_check", { attachment: 1, staves: [staff] })] },
  ]);
  const read = readUploads([{ name: "page.png", mediaType: "image/png", bytes: new Uint8Array([1]) }]);
  assert.ok("attachments" in read);
  const request = { instruction: "Write this", score, selectedIds: [], history: [], attachments: read.attachments };
  await runAssistant(model, request, "t", undefined, { pageImages: fakeImages(page).images });

  const last = seen.at(-1)!;
  assert.match(toolResult(seen[1], "score_write").error, /Read the attached music first/);
  const result = toolResult(last, "music_read_source");
  assert.match(result.fits[0], /Only bars 1–32 fit \(the source has 40\)/);
  // The heads come bar by bar, as score text is written.
  assert.equal(
    result.pages[0].heads,
    "page bar 1 (system 1)\n  staff 1, treble: E4 G4\npage bar 2\n  staff 1, treble: B4 <C5 E5>",
  );
  // The labelled page follows the reading's result, as the musician's side of the conversation.
  const afterReading = seen[2].at(-1)!;
  assert.equal(afterReading.role, "user");
  assert.ok(Array.isArray(afterReading.content) && afterReading.content.some((part) => part.type === "image"));
  const check = toolResult(last, "page_check");
  assert.equal(check.checked, "1 of 2 bars match the page");
  assert.deepEqual(check.differences[0], {
    bar: 2,
    staff,
    page: "B4 <C5 E5>",
    written: "B4 C5 D5",
    missing: ["E5"],
    extra: ["D5"],
  });
});
