import {
  chordFrom,
  eventPitches,
  everyEvent,
  findEvent,
  movePitch,
  scoreKey,
  setBarEvents,
  type Score,
} from "@/modules/score";
import { withMovedNote } from "./note-drag";

/** A drag in progress, drawn on the sheet but not yet committed. */
export type GesturePreview =
  | { kind: "pitch"; id: string; delta: number; head: number }
  | { kind: "order"; id: string; measureId: string; beforeId: string | null }
  | { kind: "width"; id: string; width: number }
  | { kind: "label"; id: string; offset: { x: number; y: number } }
  | { kind: "slur"; id: string; lift: number };

/** The event after this one in its own voice of the bar, or null: where a cancelled move puts it back. */
export function eventAfter(score: Score, eventId: string): string | null {
  const events = findEvent(score, eventId)?.voiceBar.events ?? [];
  return events[events.findIndex((e) => e.id === eventId) + 1]?.id ?? null;
}

/** Returns a copy of the score showing the preview; the input score is never modified. */
export function applyGesturePreview(score: Score, preview: GesturePreview | null): Score {
  if (!preview) return score;
  const draft = structuredClone(score);
  if (preview.kind === "pitch") {
    const event = everyEvent(draft).find((e) => e.id === preview.id);
    // A single note moves; in a chord only the grabbed note, as the drag will commit.
    if (event?.pitch && preview.delta) {
      const notes = eventPitches(event);
      const moved = notes.length > 1 ? withMovedNote(notes, preview.head, preview.delta, score) : null;
      if (notes.length === 1) event.pitch = movePitch(event.pitch, preview.delta, scoreKey(score));
      else if (moved) Object.assign(event, chordFrom(moved));
    }
  } else if (preview.kind === "label") {
    const annotation = draft.annotations.find((a) => a.id === preview.id);
    if (annotation) annotation.offset = preview.offset;
  } else if (preview.kind === "slur") {
    const slur = draft.slurs.find((s) => s.id === preview.id);
    if (slur) slur.lift = preview.lift;
  } else if (preview.kind === "width") {
    const measure = draft.measures.find((m) => m.id === preview.id);
    if (measure) measure.width = preview.width;
  } else {
    // A note moves within its own voice of the bar.
    const found = findEvent(draft, preview.id);
    if (found && found.measure.id === preview.measureId) {
      const events = found.voiceBar.events.filter((e) => e.id !== found.event.id);
      const index = preview.beforeId ? events.findIndex((e) => e.id === preview.beforeId) : events.length;
      events.splice(Math.max(0, index), 0, found.event);
      setBarEvents(found.measure, events, found.voiceId);
    }
  }
  return draft;
}
