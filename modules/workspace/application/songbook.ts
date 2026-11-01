import type { WorkspaceChats } from "@/modules/assistant";
import type { WorkspaceMeta, WorkspaceRepository } from "@/modules/projects";
import type { Score } from "@/modules/score";
import type { SheetViews } from "./sheet-view";

/** Where songs, their conversations and where their sheets were left are kept. */
export type SongStores = { workspaces: WorkspaceRepository; chats: WorkspaceChats; views: SheetViews };

/** One song on Home: its card data, and its score for the preview (null when it cannot be read). */
export type Song = { meta: WorkspaceMeta; score: Score | null };

function readScore(workspaces: WorkspaceRepository, meta: WorkspaceMeta): Score | null {
  if (meta.unreadable) return null;
  try {
    return workspaces.load(meta.id);
  } catch {
    return null;
  }
}

/**
 * Every song, most recently touched first. The first time, the pre-workspace draft and its
 * conversation become a song of their own.
 */
export function openSongbook({ workspaces, chats }: SongStores): Song[] {
  const adopted = workspaces.adoptLegacy();
  if (adopted) chats.adoptLegacy(adopted);
  return workspaces.list().map((meta) => ({ meta, score: readScore(workspaces, meta) }));
}

/** Removes a song, its conversation and where its sheet was left, for good. */
export function removeSong({ workspaces, chats, views }: SongStores, workspaceId: string): void {
  workspaces.remove(workspaceId);
  chats.remove(workspaceId);
  views.remove(workspaceId);
}
