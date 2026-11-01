import type { Score } from "@/modules/score";

/** One workspace as the Home list shows it. Timestamps are epoch milliseconds. */
export type WorkspaceMeta = {
  id: string;
  title: string;
  bars: number;
  tempo: number;
  instruments: string[];
  createdAt: number;
  updatedAt: number;
  /** The saved score could not be read: listed so it can be removed, its data left untouched. */
  unreadable?: true;
};

/** When a workspace was created and last saved. Card data itself is derived from the score. */
export type WorkspaceTimes = { createdAt: number; updatedAt: number };

/** The Home list order plus each workspace's times, keyed by workspace id (never by score id). */
export type WorkspaceIndex = {
  /** Most recently touched first. */
  order: string[];
  times: Record<string, WorkspaceTimes>;
};

export const emptyWorkspaceIndex = (): WorkspaceIndex => ({ order: [], times: {} });

/** Records a save of a workspace: keeps its first-created time, moves it to the front. */
export function touchWorkspace(index: WorkspaceIndex, workspaceId: string, now: number): WorkspaceIndex {
  return {
    order: [workspaceId, ...index.order.filter((id) => id !== workspaceId)],
    times: {
      ...index.times,
      [workspaceId]: { createdAt: index.times[workspaceId]?.createdAt ?? now, updatedAt: now },
    },
  };
}

/** Forgets a workspace; unknown ids leave the index alone. */
export function removeWorkspace(index: WorkspaceIndex, id: string): WorkspaceIndex {
  if (!index.times[id]) return index;
  const times = { ...index.times };
  delete times[id];
  return { order: index.order.filter((entry) => entry !== id), times };
}

/** The Home card for a workspace: everything but the times comes from the score itself. */
export function workspaceMeta(id: string, score: Score, times: WorkspaceTimes): WorkspaceMeta {
  return {
    id,
    title: score.title,
    bars: score.measures.length,
    tempo: score.tempo,
    instruments: score.parts.map((part) => part.name),
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
  };
}

/** The Home card for a workspace whose score could not be read. */
export function unreadableWorkspaceMeta(id: string, times: WorkspaceTimes): WorkspaceMeta {
  return { id, title: "Unreadable song", bars: 0, tempo: 0, instruments: [], ...times, unreadable: true };
}
