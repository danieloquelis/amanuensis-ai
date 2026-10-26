import type { Score } from "@/modules/score";

export interface ProjectRepository {
  load(): Score | null;
  save(score: Score): void;
}
