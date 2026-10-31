import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceScore,
  emptyWorkspaceIndex,
  removeWorkspace,
  touchWorkspace,
  workspaceMeta,
} from "@/modules/projects";

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

test("a renamed score keeps its workspace: the key never follows the score id", () => {
  const before = createWorkspaceScore("ws-seed");
  const index = touchWorkspace(emptyWorkspaceIndex(), "ws-a", 1000);
  const meta = workspaceMeta("ws-a", before, index.times["ws-a"]);
  assert.equal(meta.id, "ws-a");
  assert.notEqual(meta.id, before.id, "the card is keyed by workspace, not by score");
  assert.equal(meta.title, "Untitled");
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
