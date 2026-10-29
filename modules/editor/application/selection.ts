import { barEvents, eventOnsets, findEvent, measureEvents, type Score, type ScoreEvent } from "@/modules/score";

export type Selection = { event: ScoreEvent; measureIndex: number };

export function findSelection(score: Score, selectedId: string | null): Selection | null {
  const location = selectedId ? findEvent(score, selectedId) : null;
  return location ? { event: location.event, measureIndex: location.measureIndex } : null;
}

/** Where a toolbar tool acts: the selected note or rest, the selected bar, or the start of bar 1. */
export type ToolTarget = { barIndex: number; measureId: string; eventId: string | null; beat: number };

export function toolTarget(score: Score, selection: Selection | null, selectedBarId: string | null = null): ToolTarget {
  if (!selection) {
    const barIndex = Math.max(
      0,
      score.measures.findIndex((m) => m.id === selectedBarId),
    );
    return { barIndex, measureId: score.measures[barIndex].id, eventId: null, beat: 0 };
  }
  const measure = score.measures[selection.measureIndex];
  const events = findEvent(score, selection.event.id)?.voiceBar.events ?? barEvents(measure);
  const index = events.findIndex((e) => e.id === selection.event.id);
  const beat = eventOnsets(events)[index];
  return { barIndex: selection.measureIndex, measureId: measure.id, eventId: selection.event.id, beat };
}

/** Selecting a bar selects its first event. */
export const firstEventOfMeasure = (score: Score, measureIndex: number) =>
  barEvents(score.measures[measureIndex])[0].id;

/**
 * Keeps the selection meaningful after an edit: keep it if the event survived, otherwise move
 * to the first event of the same bar, or of the nearest remaining bar.
 */
export function selectionAfterEdit(previous: Score, next: Score, selectedId: string | null): string | null {
  if (!selectedId || findEvent(next, selectedId)) return selectedId;
  const oldIndex = previous.measures.findIndex((m) => measureEvents(m).some((e) => e.id === selectedId));
  const sameMeasure = next.measures.find((m) => m.id === previous.measures[oldIndex]?.id);
  const nearest = next.measures[Math.max(0, Math.min(oldIndex, next.measures.length - 1))];
  return barEvents(sameMeasure ?? nearest)[0].id;
}
