import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTACHMENT_LIMITS,
  handleAssistantRequest,
  readUploads,
  type ChatMessage,
  type ModelPort,
  type Upload,
} from "@/modules/assistant";
import { createExample } from "@/modules/score";

const png = (name = "page.png"): Upload => ({ name, mediaType: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) });
const text = (body: string, name = "chart.txt"): Upload => ({
  name,
  mediaType: "text/plain",
  bytes: new TextEncoder().encode(body),
});

test("pictures and PDFs become data URLs, text files become text", () => {
  const read = readUploads([png(), text("| C | Am | F G |", "chart.abc")]);
  assert.ok("attachments" in read);
  const [picture, chart] = read.attachments;
  assert.equal(picture.kind, "image");
  assert.ok("dataUrl" in picture && picture.dataUrl.startsWith("data:image/png;base64,iVBORw"));
  assert.deepEqual(chart, { kind: "text", name: "chart.abc", text: "| C | Am | F G |" });
});

test("files beyond the limits, or of another kind, are refused with a reason", () => {
  const many = Array.from({ length: ATTACHMENT_LIMITS.files + 1 }, (_, i) => png(`p${i}.png`));
  assert.match((readUploads(many) as { error: string }).error, /up to 10 files/);
  const zip = { name: "song.zip", mediaType: "application/zip", bytes: new Uint8Array(1) };
  assert.match((readUploads([zip]) as { error: string }).error, /isn't a picture, a PDF or a text file/);
});

test("an attached page reaches the model in the request's message, even without words", async () => {
  const seen: ChatMessage[] = [];
  const model: ModelPort = {
    async complete(messages) {
      seen.push(...messages);
      return { content: "It is in E-flat major.", toolCalls: [] };
    },
  };
  const body = { instruction: "", score: createExample(), selectedIds: [], history: [] };
  const response = await handleAssistantRequest(body, model, undefined, { uploads: [png()] });
  assert.equal(response.status, 200);
  const user = seen.find((message) => message.role === "user")!;
  assert.ok(Array.isArray(user.content));
  const [words, title, picture] = user.content;
  assert.ok(words.type === "text" && /attached music without saying anything else/.test(words.text));
  assert.deepEqual(title, { type: "text", text: "[Attachment 1: page.png]" });
  assert.equal(picture.type, "image");
});

test("a request with neither words nor files is refused", async () => {
  const model: ModelPort = { complete: async () => ({ content: "", toolCalls: [] }) };
  const body = { instruction: " ", score: createExample(), selectedIds: [], history: [] };
  assert.equal((await handleAssistantRequest(body, model)).status, 400);
});
