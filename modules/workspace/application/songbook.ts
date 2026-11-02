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

/** A score title may be this long. */
const TITLE_MAX = 100;
const COPY = " (copy)";

/**
 * Makes a copy of a song: its score, as it is, under a new song titled "… (copy)", listed first.
 * Its conversation is not copied: the copy starts a fresh chat. Returns the new song's ID, or
 * null for a song whose score cannot be read.
 */
export function copySong({ workspaces }: SongStores, song: Song): string | null {
  if (!song.score) return null;
  const id = workspaces.create();
  // The new song's own score ID (from the blank it was created with), the copied music and title.
  const blank = workspaces.load(id)!;
  const title = `${song.score.title.slice(0, TITLE_MAX - COPY.length)}${COPY}`;
  workspaces.save(id, { ...song.score, id: blank.id, title });
  return id;
}
