import { getMeasure, getStaff } from "../queries";
import type { Draft, OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** Global tempo, or a local change starting at `measureId`. Always quarter-note BPM. */
export function setTempo(draft: Draft, op: OperationOf<"setTempo">) {
  if (op.measureId) getMeasure(draft, op.measureId).tempo = op.tempo;
  else draft.tempo = op.tempo;
}

export function removeTempo(draft: Draft, op: OperationOf<"removeTempo">) {
  delete getMeasure(draft, op.measureId).tempo;
}

/** Changes the signature only; written pitches keep their spelling and sound the same. */
export function setKey(draft: Draft, op: OperationOf<"setKey">) {
  draft.key = { ...op.key };
}

export function rename(draft: Draft, op: OperationOf<"rename">) {
  draft.title = op.title;
}

/**
 * Adds or replaces an indication. Without an ID, a dynamic replaces the existing dynamic at the
 * same anchor; text always adds a new indication.
 */
export function putAnnotation(draft: Draft, op: OperationOf<"putAnnotation">, { idPrefix }: OperationContext) {
  if (op.id && !draft.annotations.some((a) => a.id === op.id)) {
    throw new Error("Indication not found.");
  }
  const existingDynamicId =
    op.kind === "dynamic"
      ? draft.annotations.find((a) => a.targetId === op.targetId && a.kind === "dynamic")?.id
      : undefined;
  // An indication on a bar belongs to a staff: the first, until scores hold several.
  const onBar = draft.measures.some((m) => m.id === op.targetId);
  const annotation = {
    id: op.id ?? existingDynamicId ?? `${idPrefix}-annotation`,
    targetId: op.targetId,
    kind: op.kind,
    text: op.text,
    ...(onBar ? { staffId: getStaff(draft, op.staffId).id } : {}),
  };
  draft.annotations = [...draft.annotations.filter((a) => a.id !== annotation.id), annotation];
}

export function putRepeat(draft: Draft, op: OperationOf<"putRepeat">, { idPrefix }: OperationContext) {
  if (op.id && !draft.repeats.some((r) => r.id === op.id)) {
    throw new Error("Repeat not found.");
  }
  const repeat = {
    id: op.id ?? `${idPrefix}-repeat`,
    startMeasureId: op.startMeasureId,
    endMeasureId: op.endMeasureId,
    count: op.count,
  };
  draft.repeats = [...draft.repeats.filter((r) => r.id !== repeat.id), repeat];
}

/** Removes an indication, repeat, chord symbol, mark or slur by ID. */
export function removeNotation(draft: Draft, op: OperationOf<"removeNotation">) {
  const lists = [draft.annotations, draft.repeats, draft.chords, draft.marks, draft.slurs];
  if (!lists.some((items) => items.some((i) => i.id === op.id))) throw new Error("Indication not found.");
  draft.annotations = draft.annotations.filter((a) => a.id !== op.id);
  draft.repeats = draft.repeats.filter((r) => r.id !== op.id);
  draft.chords = draft.chords.filter((c) => c.id !== op.id);
  draft.marks = draft.marks.filter((m) => m.id !== op.id);
  draft.slurs = draft.slurs.filter((s) => s.id !== op.id);
}
