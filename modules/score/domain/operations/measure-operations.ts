import { getMeasure } from "../queries";
import { durationFromBeats } from "../rhythm";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** Inserts an empty bar (full-measure rest) after the given bar, or at the end. */
export function appendMeasure(draft: Draft, op: OperationOf<"appendMeasure">, { idPrefix }: OperationContext) {
  const index = op.afterMeasureId
    ? draft.measures.indexOf(getMeasure(draft, op.afterMeasureId))
    : draft.measures.length - 1;
  const meter = { ...draft.measures[index].meter };
  draft.measures.splice(index + 1, 0, {
    id: `${idPrefix}-bar`,
    meter,
    events: fullMeasureRest(meter, idPrefix),
  });
}

export function deleteMeasure(draft: Draft, op: OperationOf<"deleteMeasure">) {
  const measure = getMeasure(draft, op.measureId);
  detachFrom(draft, [measure.id, ...measure.events.map((e) => e.id)]);
  draft.measures = draft.measures.filter((m) => m.id !== measure.id);
}

/** Copies a bar and the indications anchored to it, giving every copy a fresh ID. */
export function duplicateMeasure(draft: Draft, op: OperationOf<"duplicateMeasure">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  const copy = structuredClone(measure);
  const copiedIds = new Map([[measure.id, `${idPrefix}-bar`]]);
  copy.id = `${idPrefix}-bar`;
  copy.events.forEach((event, index) => {
    copiedIds.set(event.id, `${idPrefix}-n${index}`);
    event.id = `${idPrefix}-n${index}`;
  });
  const annotations = draft.annotations
    .filter((a) => copiedIds.has(a.targetId))
    .map((a, index) => ({ ...a, id: `${idPrefix}-a${index}`, targetId: copiedIds.get(a.targetId)! }));
  draft.annotations.push(...annotations);
  draft.measures.splice(draft.measures.indexOf(measure) + 1, 0, copy);
}

export function clearMeasure(draft: Draft, op: OperationOf<"clearMeasure">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  detachFrom(
    draft,
    measure.events.map((e) => e.id),
  );
  measure.events = fullMeasureRest(measure.meter, idPrefix);
}

export function replaceMeasure(draft: Draft, op: OperationOf<"replaceMeasure">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  detachFrom(
    draft,
    measure.events.map((e) => e.id),
  );
  measure.events = op.events.map((event, index) => ({
    id: `${idPrefix}-n${index}`,
    pitch: event.pitch,
    duration: durationFromBeats(event.duration),
  }));
}

/** Layout-only override; never changes musical timing. `null` restores default spacing. */
export function setMeasureWidth(draft: Draft, op: OperationOf<"setMeasureWidth">) {
  const measure = getMeasure(draft, op.measureId);
  if (op.width === null) delete measure.width;
  else measure.width = op.width;
}
