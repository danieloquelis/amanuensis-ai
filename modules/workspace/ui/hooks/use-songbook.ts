import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localWorkspaceChats } from "@/modules/assistant";
import { localWorkspaceRepository } from "@/modules/projects";
import { openSongbook, removeSong, type Song, type SongStores } from "../../application/songbook";

const stores: SongStores = { workspaces: localWorkspaceRepository, chats: localWorkspaceChats };

/**
 * Home's songs and what can be done with them. Removing takes two presses on the same song: the
 * first arms it (`armed`), the second removes it; `disarm` cancels.
 */
export function useSongbook() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [armed, setArmed] = useState<string | null>(null);

  // Storage is read after mount, so the server and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSongs(openSongbook(stores)));
    return () => cancelAnimationFrame(frame);
  }, []);

  const create = () => router.push(`/workspace/${stores.workspaces.create()}`);

  const remove = (workspaceId: string) => {
    if (armed !== workspaceId) {
      setArmed(workspaceId);
      return;
    }
    removeSong(stores, workspaceId);
    setArmed(null);
    setSongs((all) => all.filter((song) => song.meta.id !== workspaceId));
  };

  return { songs, armed, create, remove, disarm: () => setArmed(null) };
}
