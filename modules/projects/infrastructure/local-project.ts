import { parseScore, type Score } from "@/modules/score";
import type { ProjectRepository } from "../application/project-repository";

export const STORAGE_KEY = "amanuensis.score.v1";
export function loadProject(): Score | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseScore(JSON.parse(raw)) : null;
}
export function saveProject(score: Score) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(score));
}
export const localProjectRepository: ProjectRepository = { load: loadProject, save: saveProject };
export function downloadProject(score: Score) {
  const blob = new Blob([JSON.stringify(score, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${score.title.replace(/[^a-z0-9 -]/gi, "").trim() || "score"}.amanuensis.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
