import type { Score } from "@/modules/score";

/** Port for loading and saving the active score. Implementations may throw on unreadable data. */
export interface ProjectRepository {
  load(): Score | null;
  save(score: Score): void;
}
