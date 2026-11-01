import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localWorkspaceChats } from "@/modules/assistant";
import { localWorkspaceRepository } from "@/modules/projects";
import { openSongbook, removeSong, type Song, type SongStores } from "../../application/songbook";

const stores: SongStores = { workspaces: localWorkspaceRepository, chats: localWorkspaceChats };

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

  const create = () => router.push(`/workspace/${stores.workspaces.create()}`);

  /** Deletes a song and its chat for good: picking Delete in its menu is the deliberate step. */
  const remove = (workspaceId: string) => {
    removeSong(stores, workspaceId);
    setSongs((all) => all.filter((song) => song.meta.id !== workspaceId));
  };

  // `now` is set when the list is read, so it doubles as "loaded": nothing flashes as empty first.
  return { songs, now, loaded: now > 0, create, remove };
}
