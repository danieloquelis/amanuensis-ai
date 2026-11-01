import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localWorkspaceChats, type StartRequest } from "@/modules/assistant";
import { localWorkspaceRepository } from "@/modules/projects";
import { holdFirstRequest } from "../../application/first-request";
import { openSongbook, removeSong, type Song, type SongStores } from "../../application/songbook";
import { localSheetViews } from "../../infrastructure/local-sheet-views";

const stores: SongStores = { workspaces: localWorkspaceRepository, chats: localWorkspaceChats, views: localSheetViews };

/** Home's songs and what can be done with them. */
export function useSongbook() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  // When the list was read: "Edited 20 hours ago" is measured from here, never during render.
  const [now, setNow] = useState(0);

  // Storage is read after mount, so the server and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSongs(openSongbook(stores));
      setNow(Date.now());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  /** A blank song. */
  const create = () => router.push(`/workspace/${stores.workspaces.create()}`);

  /** A new song that opens running this request as its first turn. */
  const start = (request: StartRequest) => {
    const workspaceId = stores.workspaces.create();
    holdFirstRequest(workspaceId, request);
    router.push(`/workspace/${workspaceId}`);
  };

  /** Deletes a song and its chat for good: picking Delete in its menu is the deliberate step. */
  const remove = (workspaceId: string) => {
    removeSong(stores, workspaceId);
    setSongs((all) => all.filter((song) => song.meta.id !== workspaceId));
  };

  // `now` is set when the list is read, so it doubles as "loaded": nothing flashes as empty first.
  return { songs, now, loaded: now > 0, create, start, remove };
}
