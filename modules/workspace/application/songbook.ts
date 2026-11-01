import type { WorkspaceChats } from "@/modules/assistant";
import type { WorkspaceMeta, WorkspaceRepository } from "@/modules/projects";
import type { Score } from "@/modules/score";

/** Where songs and their conversations are kept. */
export type SongStores = { workspaces: WorkspaceRepository; chats: WorkspaceChats };

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

/** Removes a song and its conversation for good. */
export function removeSong({ workspaces, chats }: SongStores, workspaceId: string): void {
  workspaces.remove(workspaceId);
  chats.remove(workspaceId);
}
