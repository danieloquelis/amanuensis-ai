import { parseScore, type Score } from "@/modules/score";
import { createWorkspaceScore } from "../application/new-workspace";
import type { WorkspaceRepository } from "../application/project-repository";
import {
  emptyWorkspaceIndex,
  removeWorkspace,
  touchWorkspace,
  unreadableWorkspaceMeta,
  workspaceMeta,
  type WorkspaceIndex,
  type WorkspaceMeta,
} from "../application/workspace-index";

/** The Home list order plus creation and save times. */
const INDEX_KEY = "amanuensis.workspaces.v1";
/** The pre-workspace single draft, adopted once into a workspace. */
const LEGACY_KEY = "amanuensis.score.v1";
const scoreKey = (id: string) => `amanuensis.score.${id}`;

/** Guards the index shape; anything else counts as corrupt and is rebuilt. */
function parseIndex(raw: string): WorkspaceIndex {
  const parsed: WorkspaceIndex = JSON.parse(raw);
  if (!Array.isArray(parsed.order) || typeof parsed.times !== "object" || parsed.times === null) {
    throw new Error("Unrecognized workspace index");
  }
  return parsed;
}

/** True when there is no usable index: absent, or corrupt enough to rebuild from the score keys. */
function indexAbsent(): boolean {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw === null) return true;
    parseIndex(raw);
    return false;
  } catch {
    return true;
  }
}

/** Rebuilds the index from the score keys when it is missing or unreadable. */
function rebuildIndex(now: number): WorkspaceIndex {
  let index = emptyWorkspaceIndex();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("amanuensis.score.") || key === LEGACY_KEY) continue;
    // Unreadable scores are indexed too: Home lists them so they can be removed.
    index = touchWorkspace(index, key.slice("amanuensis.score.".length), now);
  }
  return index;
}

/** Reads the index, rebuilding it from the score keys when it is missing or unreadable. */
function readIndex(): WorkspaceIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) return parseIndex(raw);
  } catch {
    // Corrupt index below; the score keys are the source of truth.
  }
  return rebuildIndex(Date.now());
}

/** Every workspace in this browser's localStorage, with its Home card data. */
export const localWorkspaceRepository: WorkspaceRepository = {
  list(): WorkspaceMeta[] {
    const index = readIndex();
    const metas: WorkspaceMeta[] = [];
    const kept = emptyWorkspaceIndex();
    for (const id of index.order) {
      const raw = localStorage.getItem(scoreKey(id));
      // A workspace whose score is gone stops being listed.
      if (!raw) continue;
      const times = index.times[id] ?? { createdAt: Date.now(), updatedAt: Date.now() };
      kept.order.push(id);
      kept.times[id] = times;
      try {
        metas.push(workspaceMeta(id, parseScore(JSON.parse(raw)), times));
      } catch {
        // Unreadable: still listed, so it never silently disappears; its key is left untouched.
        metas.push(unreadableWorkspaceMeta(id, times));
      }
    }
    if (kept.order.length !== index.order.length) localStorage.setItem(INDEX_KEY, JSON.stringify(kept));
    return metas;
  },

  load(id: string): Score | null {
    const raw = localStorage.getItem(scoreKey(id));
    return raw ? parseScore(JSON.parse(raw)) : null;
  },

  save(id: string, score: Score): void {
    localStorage.setItem(scoreKey(id), JSON.stringify(score));
    localStorage.setItem(INDEX_KEY, JSON.stringify(touchWorkspace(readIndex(), id, Date.now())));
  },

  create(): string {
    const id = crypto.randomUUID();
    this.save(id, createWorkspaceScore(crypto.randomUUID()));
    return id;
  },

  remove(id: string): void {
    localStorage.removeItem(scoreKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(removeWorkspace(readIndex(), id)));
  },

  adoptLegacy(): string | null {
    if (!indexAbsent()) return null;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    let score: Score;
    try {
      score = parseScore(JSON.parse(raw));
    } catch {
      // A corrupt legacy draft stays where it is instead of breaking Home.
      return null;
    }
    const id = crypto.randomUUID();
    this.save(id, score);
    localStorage.removeItem(LEGACY_KEY);
    return id;
  },
};
