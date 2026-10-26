import { findEvent, type Score, type ScoreEvent } from "@/modules/score";

export type Selection = { event: ScoreEvent; measureIndex: number };

export function findSelection(score: Score, selectedId: string | null): Selection | null {
  const location = selectedId ? findEvent(score, selectedId) : null;
  return location ? { event: location.event, measureIndex: location.measureIndex } : null;
}

/** Selecting a bar selects its first event. */
export const firstEventOfMeasure = (score: Score, measureIndex: number) => score.measures[measureIndex].events[0].id;

/**
 * Keeps the selection meaningful after an edit: keep it if the event survived, otherwise move
 * to the first event of the same bar, or of the nearest remaining bar.
 */
export function selectionAfterEdit(previous: Score, next: Score, selectedId: string | null): string | null {
  if (!selectedId || findEvent(next, selectedId)) return selectedId;
  const oldIndex = previous.measures.findIndex((m) => m.events.some((e) => e.id === selectedId));
  const sameMeasure = next.measures.find((m) => m.id === previous.measures[oldIndex]?.id);
  const nearest = next.measures[Math.max(0, Math.min(oldIndex, next.measures.length - 1))];
  return (sameMeasure ?? nearest).events[0].id;
}
