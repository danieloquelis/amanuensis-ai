import {
  findStaff,
  barStyle,
  MARK_LABELS,
  meterName,
  nextSectionLabel,
  type MarkKind,
  type Meter,
  type Operation,
  type Score,
} from "@/modules/score";
import { checkOperation } from "./operation-check";
import type { Edit } from "./note-edits";

/** An edit, or the reason it cannot be made. */
export type EditResult = Edit | { error: string };

/** Sets the meter from `barIndex` up to the next time-signature change, as notation editors do. */
export function meterEdit(score: Score, barIndex: number, meter: Meter): EditResult {
  const operation: Operation = {
    type: "setMeter",
    measureIds: [score.measures[barIndex].id],
    meter,
    policy: "auto",
    extend: true,
  };
  const problem = checkOperation(score, operation);
  return problem ? { error: problem } : { operation, receipt: `Time signature ${meterName(meter)}` };
}

/** Gives a bar the next unused rehearsal letter (A, B, …); a bar that has a section keeps it. */
export function addSection(score: Score, barIndex: number): Edit | null {
  const measure = score.measures[barIndex];
  if (measure.section) return null;
  const label = nextSectionLabel(score.measures.flatMap((m) => (m.section ? [m.section] : [])));
  return { operation: { type: "setSection", measureId: measure.id, label }, receipt: `Section ${label}` };
}

/** Adds a navigation mark to a bar. Marks are independent: add as many as the form needs. */
export function addMark(score: Score, barIndex: number, kind: MarkKind): Edit {
  return {
    operation: { type: "putMark", measureId: score.measures[barIndex].id, kind },
    receipt: MARK_LABELS[kind],
  };
}

/** Shows a bar of one staff as notes, rhythm slashes, or a repeat of the previous bar. */
export function barStyleEdit(
  score: Score,
  barIndex: number,
  style: "notes" | "slashes" | "repeat",
  staffId: string,
): Edit | null {
  const measure = score.measures[barIndex];
  const main = findStaff(score, staffId)?.voices[0].id;
  if ((barStyle(measure, main) ?? "notes") === style) return null;
  const receipt = { notes: "Notes", slashes: "Slash bar", repeat: "Repeat previous bar" }[style];
  return { operation: { type: "setMeasureStyle", measureId: measure.id, style, staffId }, receipt };
}

const indexOf = (score: Score, measureId: string) => score.measures.findIndex((m) => m.id === measureId);
const repeatContaining = (score: Score, barIndex: number) =>
  score.repeats.find((r) => indexOf(score, r.startMeasureId) <= barIndex && barIndex <= indexOf(score, r.endMeasureId));

/** Start-repeat on a bar: moves the start of a repeat containing the bar, or begins a new one there. */
export function startRepeatEdit(score: Score, barIndex: number): Edit | null {
  const measure = score.measures[barIndex];
  const containing = repeatContaining(score, barIndex);
  if (containing?.startMeasureId === measure.id) return null;
  const { id, endMeasureId, count } = containing ?? { id: undefined, endMeasureId: measure.id, count: 2 };
  return {
    operation: { type: "putRepeat", ...(id ? { id } : {}), startMeasureId: measure.id, endMeasureId, count },
    receipt: "Repeat start",
  };
}

/**
 * End-repeat on a bar: moves the end of a repeat containing the bar, or repeats back to just
 * after the previous repeat (or the first bar).
 */
export function endRepeatEdit(score: Score, barIndex: number): Edit | null {
  const measure = score.measures[barIndex];
  const containing = repeatContaining(score, barIndex);
  if (containing?.endMeasureId === measure.id) return null;
  if (containing) {
    return { operation: { ...containing, type: "putRepeat", endMeasureId: measure.id }, receipt: "Repeat end" };
  }
  const previousEnds = score.repeats.map((r) => indexOf(score, r.endMeasureId)).filter((end) => end < barIndex);
  const start = previousEnds.length ? Math.max(...previousEnds) + 1 : 0;
  return {
    operation: { type: "putRepeat", startMeasureId: score.measures[start].id, endMeasureId: measure.id, count: 2 },
    receipt: "Repeat end",
  };
}

/** Something on the sheet other than a note or bar that can be selected and deleted. */
export type SheetItem = { kind: "chord" | "annotation" | "mark" | "repeat" | "section" | "slur"; id: string };

/** The operation that removes a selected item; a section's `id` is its bar. */
export function removeItemOperation(item: SheetItem): Operation {
  if (item.kind === "section") return { type: "setSection", measureId: item.id, label: null };
  return { type: "removeNotation", id: item.id };
}
