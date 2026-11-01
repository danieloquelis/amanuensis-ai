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
import {
  editedAgo,
  followPlayhead,
  PREVIEW_PARTS,
  previewScore,
  removeSong,
  type SheetViews,
} from "@/modules/workspace";

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

test("a card is keyed by workspace and reads title, length, tempo and instruments from the score", () => {
  const score = createExample();
  const meta = workspaceMeta("ws-a", score, { createdAt: 1000, updatedAt: 2000 });
  assert.equal(meta.id, "ws-a", "the card is keyed by workspace, never by score id");
  assert.equal(meta.title, score.title);
  assert.equal(meta.bars, score.measures.length);
  assert.equal(meta.tempo, score.tempo);
  assert.deepEqual(meta.instruments, [{ instrument: "piano", name: "Piano" }]);
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
  const views = { remove: (id: string) => removed.push(`view ${id}`) } as unknown as SheetViews;
  removeSong({ workspaces, chats, views }, "ws-a");
  assert.deepEqual(removed, ["score ws-a", "chat ws-a", "view ws-a"]);
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

test("a card says when its song was last edited in words", () => {
  const now = Date.UTC(2026, 10, 1, 12);
  const hours = (count: number) => count * 60 * 60 * 1000;
  assert.equal(editedAgo(now - 20_000, now), "Edited just now");
  assert.equal(editedAgo(now - hours(20), now), "Edited 20 hours ago");
  assert.equal(editedAgo(now - hours(30), now), "Edited yesterday");
  assert.equal(editedAgo(now - hours(24 * 21), now), "Edited 3 weeks ago");
});

test("playback scrolls only when the line being played leaves the middle of the view, and to centre it", () => {
  const view = { top: 0, bottom: 800, left: 0, right: 1000 };
  const scroll = { top: 300, left: 0 };
  const line = (top: number, left = 500) => ({ top, bottom: top + 200, left, right: left + 2 });
  assert.equal(followPlayhead(view, line(300), scroll), null, "already in the middle");
  // The next line, lower down: its middle (650) comes to the view's middle (400).
  assert.deepEqual(followPlayhead(view, line(550), scroll), { top: 550, left: 0 });
  // Near the right side (zoomed in), the view moves along to keep it clear of the edge.
  assert.deepEqual(followPlayhead(view, line(300, 950), scroll), { top: 300, left: 800 });
  // Never above the top of the sheet.
  assert.deepEqual(followPlayhead(view, line(-400), { top: 100, left: 0 }), { top: 0, left: 0 });
});
