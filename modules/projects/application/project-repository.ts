import type { Score } from "@/modules/score";
import type { WorkspaceMeta } from "./workspace-index";

/** Port for loading and saving the active score. Implementations may throw on unreadable data. */
export interface ProjectRepository {
  load(): Score | null;
  save(score: Score): void;
}

/** Port for the workspaces on this device. `load` throws on unreadable data, like the single-score port. */
export interface WorkspaceRepository {
  /** Every workspace, most recently touched first. */
  list(): WorkspaceMeta[];
  load(id: string): Score | null;
  /** Saves by workspace id: the score's own id may change (it does on `newScore`) without moving the workspace. */
  save(id: string, score: Score): void;
  remove(id: string): void;
  /** Saves a blank song under a new workspace id and returns that id. */
  create(): string;
  /**
   * Adopts the pre-workspace draft (`amanuensis.score.v1`) as a workspace and returns its id,
   * or null when there is no legacy draft. Runs at most once: it deletes the legacy key.
   */
  adoptLegacy(): string | null;
}

/** One workspace seen as the editor's single score: the editor never needs to know its id. */
export const workspaceProject = (workspaces: WorkspaceRepository, workspaceId: string): ProjectRepository => ({
  load: () => workspaces.load(workspaceId),
  save: (score) => workspaces.save(workspaceId, score),
});
