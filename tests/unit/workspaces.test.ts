import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceChats } from "@/modules/assistant";
import {
  createWorkspaceScore,
  emptyWorkspaceIndex,
  removeWorkspace,
  touchWorkspace,
  workspaceMeta,
  type WorkspaceRepository,
} from "@/modules/projects";
import { applyCommand, createExample } from "@/modules/score";
import { PREVIEW_PARTS, previewScore, removeSong } from "@/modules/workspace";

test("touching a workspace records its times and moves it to the front", () => {
  let index = emptyWorkspaceIndex();
  index = touchWorkspace(index, "ws-a", 1000);
  index = touchWorkspace(index, "ws-b", 2000);
  assert.deepEqual(index.order, ["ws-b", "ws-a"], "most recently touched first");
  assert.deepEqual(index.times["ws-b"], { createdAt: 2000, updatedAt: 2000 });
  assert.deepEqual(index.times["ws-a"], { createdAt: 1000, updatedAt: 1000 });
});

test("re-saving keeps the first-created time and refreshes the rest", () => {
  let index = touchWorkspace(emptyWorkspaceIndex(), "ws-a", 1000);
  index = touchWorkspace(index, "ws-a", 3000);
  assert.deepEqual(index.times["ws-a"], { createdAt: 1000, updatedAt: 3000 });
  assert.deepEqual(index.order, ["ws-a"], "no duplicates");
});

test("a card is keyed by workspace and reads title, length, tempo and instrument names from the score", () => {
  const score = createExample();
  const meta = workspaceMeta("ws-a", score, { createdAt: 1000, updatedAt: 2000 });
  assert.equal(meta.id, "ws-a", "the card is keyed by workspace, never by score id");
  assert.equal(meta.title, score.title);
  assert.equal(meta.bars, score.measures.length);
  assert.equal(meta.tempo, score.tempo);
  assert.deepEqual(meta.instruments, ["Piano"], "shown names, not instrument ids");
});

test("a preview draws at most three instruments and leaves the song untouched", () => {
  let score = createExample();
  for (const instrument of ["guitar", "trumpet", "flute", "drums"] as const) {
    score = applyCommand(score, {
      requestId: `add-${instrument}`,
      expectedRevision: score.revision,
      operation: { type: "addPart", instrument },
    });
  }
  const preview = previewScore(score);
  assert.equal(preview.parts.length, PREVIEW_PARTS);
  assert.deepEqual(
    preview.parts.map((part) => part.id),
    score.parts.slice(0, PREVIEW_PARTS).map((part) => part.id),
  );
  assert.equal(score.parts.length, 5);
});

test("removing a song removes its conversation too", () => {
  const removed: string[] = [];
  const workspaces = { remove: (id: string) => removed.push(`score ${id}`) } as unknown as WorkspaceRepository;
  const chats = { remove: (id: string) => removed.push(`chat ${id}`) } as unknown as WorkspaceChats;
  removeSong({ workspaces, chats }, "ws-a");
  assert.deepEqual(removed, ["score ws-a", "chat ws-a"]);
});

test("a new workspace is a blank song with a fresh identity", () => {
  const score = createWorkspaceScore("fresh-1");
  assert.equal(score.id, "fresh-1-0-score");
  assert.equal(score.title, "Untitled");
  assert.equal(score.measures.length, 4);
  assert.notEqual(score.id, createWorkspaceScore("fresh-2").id);
});

test("removing forgets the workspace and ignores unknown ids", () => {
  const index = touchWorkspace(emptyWorkspaceIndex(), "ws-a", 1000);
  assert.deepEqual(removeWorkspace(index, "missing"), index);
  const removed = removeWorkspace(index, "ws-a");
  assert.deepEqual(removed, { order: [], times: {} });
});
