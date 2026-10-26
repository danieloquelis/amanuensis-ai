import { parseScore, type Score } from "@/modules/score";
import type { ProjectRepository } from "../application/project-repository";

/** Unchanged since v1 so earlier drafts still open (they are migrated on load). */
const STORAGE_KEY = "amanuensis.score.v1";

/** Single-score repository in this browser's localStorage. */
export const localProjectRepository: ProjectRepository = {
  load(): Score | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseScore(JSON.parse(raw)) : null;
  },
  save(score: Score) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(score));
  },
};
