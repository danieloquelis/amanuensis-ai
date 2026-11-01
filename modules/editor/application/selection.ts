import {
  allStaves,
  barEvents,
  eventOnsets,
  findEvent,
  groupOf,
  measureEvents,
  partOf,
  voiceInfo,
  type Score,
  type ScoreEvent,
} from "@/modules/score";

export type Selection = { event: ScoreEvent; measureIndex: number };

export function findSelection(score: Score, selectedId: string | null): Selection | null {
  const location = selectedId ? findEvent(score, selectedId) : null;
  return location ? { event: location.event, measureIndex: location.measureIndex } : null;
}

/**
 * Where a toolbar tool acts: the selected note or rest, the selected bar, or the start of bar 1.
 * `partId` is the instrument it belongs to: the note's, the lane's of a bar picked in one, else the first;
 * `staffId` the staff likewise (a piano's lower staff, the drums).
 */
export type ToolTarget = {
  barIndex: number;
  measureId: string;
  eventId: string | null;
  beat: number;
  partId: string;
  staffId: string;
};

export function toolTarget(
  score: Score,
  selection: Selection | null,
  selectedBarId: string | null = null,
  selectedStaffId: string | null = null,
): ToolTarget {
  if (!selection) {
    const barIndex = Math.max(
      0,
      score.measures.findIndex((m) => m.id === selectedBarId),
    );
    const lane = score.parts.find((part) => part.staves.some((staff) => staff.id === selectedStaffId));
    const partId = (lane ?? score.parts[0]).id;
    const staffId = lane ? selectedStaffId! : allStaves(score)[0].id;
    return { barIndex, measureId: score.measures[barIndex].id, eventId: null, beat: 0, partId, staffId };
  }
  const measure = score.measures[selection.measureIndex];
  const events = findEvent(score, selection.event.id)?.voiceBar.events ?? barEvents(measure);
  const index = events.findIndex((e) => e.id === selection.event.id);
  // A triplet's notes fall between the beats chords and marks sit on: its tools act from where it starts.
  const group = groupOf(events, selection.event.id);
  const beat = eventOnsets(events)[group ? group.first : index];
  const partId = partOf(score, selection.event.id).id;
  const voiceId = findEvent(score, selection.event.id)?.voiceId;
  const staffId = (voiceId && voiceInfo(score, voiceId)?.staff.id) || allStaves(score)[0].id;
  return {
    barIndex: selection.measureIndex,
    measureId: measure.id,
    eventId: selection.event.id,
    beat,
    partId,
    staffId,
  };
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
