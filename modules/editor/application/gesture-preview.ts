import { movePitch, scoreKey, type Score } from "@/modules/score";

/** A drag in progress, drawn on the sheet but not yet committed. */
export type GesturePreview =
  | { kind: "pitch"; id: string; delta: number }
  | { kind: "order"; id: string; measureId: string; beforeId: string | null }
  | { kind: "width"; id: string; width: number }
  | { kind: "label"; id: string; offset: { x: number; y: number } };

/** Returns a copy of the score showing the preview; the input score is never modified. */
export function applyGesturePreview(score: Score, preview: GesturePreview | null): Score {
  if (!preview) return score;
  const draft = structuredClone(score);
  if (preview.kind === "pitch") {
    const event = draft.measures.flatMap((m) => m.events).find((e) => e.id === preview.id);
    if (event?.pitch && preview.delta) event.pitch = movePitch(event.pitch, preview.delta, scoreKey(score));
  } else if (preview.kind === "label") {
    const annotation = draft.annotations.find((a) => a.id === preview.id);
    if (annotation) annotation.offset = preview.offset;
  } else if (preview.kind === "width") {
    const measure = draft.measures.find((m) => m.id === preview.id);
    if (measure) measure.width = preview.width;
  } else {
    const measure = draft.measures.find((m) => m.id === preview.measureId);
    const event = measure?.events.find((e) => e.id === preview.id);
    if (measure && event) {
      measure.events = measure.events.filter((e) => e.id !== event.id);
      const index = preview.beforeId
        ? measure.events.findIndex((e) => e.id === preview.beforeId)
        : measure.events.length;
      measure.events.splice(Math.max(0, index), 0, event);
    }
  }
  return draft;
}
