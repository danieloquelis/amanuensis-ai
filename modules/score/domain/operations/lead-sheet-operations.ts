import { CHORD_QUALITY_NAMES, parseChordSymbol } from "../chords";
import { getMeasure, getStaff } from "../queries";
import { barStyle, setBarStyle } from "../voice-access";
import { restStaff, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

export function putChord(draft: Draft, op: OperationOf<"putChord">, { idPrefix }: OperationContext) {
  const parsed = parseChordSymbol(op.symbol);
  if (!parsed) {
    const examples = CHORD_QUALITY_NAMES.slice(0, 12)
      .map((q) => `C${q}`)
      .join(", ");
    throw new Error(`"${op.symbol}" is not a chord symbol I can read. Try ${examples}, or add a bass like C/E.`);
  }
  getMeasure(draft, op.measureId);
  if (op.id && !draft.chords.some((c) => c.id === op.id)) throw new Error("Chord not found.");
  const onSameBeat = draft.chords.find((c) => c.measureId === op.measureId && c.beat === op.beat);
  const id = op.id ?? onSameBeat?.id ?? `${idPrefix}-chord`;
  const replaced = new Set([id, onSameBeat?.id]);
  draft.chords = [
    ...draft.chords.filter((c) => !replaced.has(c.id)),
    { id, measureId: op.measureId, beat: op.beat, ...parsed },
  ];
}

/**
 * Switches a bar between notes and lead-sheet displays. Slashes and repeat signs replace the
 * bar's notes with a whole-bar rest; chord symbols on the bar are kept.
 */
export function setMeasureStyle(draft: Draft, op: OperationOf<"setMeasureStyle">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  const staff = getStaff(draft, op.staffId);
  const main = staff.voices[0].id;
  if (op.style === "notes") {
    setBarStyle(measure, undefined, main);
    return;
  }
  if (barStyle(measure, main) === op.style) return;
  restStaff(draft, measure, staff, idPrefix);
  setBarStyle(measure, op.style, main);
}

export function setSection(draft: Draft, op: OperationOf<"setSection">) {
  const measure = getMeasure(draft, op.measureId);
  if (op.label === null) delete measure.section;
  else measure.section = op.label;
}

/** Adds a mark; the same kind twice on one bar is kept once. With `id`, moves or changes that mark. */
export function putMark(draft: Draft, op: OperationOf<"putMark">, { idPrefix }: OperationContext) {
  getMeasure(draft, op.measureId);
  if (op.id && !draft.marks.some((m) => m.id === op.id)) throw new Error("Mark not found.");
  const duplicate = draft.marks.find((m) => m.measureId === op.measureId && m.kind === op.kind && m.id !== op.id);
  if (duplicate) return;
  const mark = { id: op.id ?? `${idPrefix}-mark`, measureId: op.measureId, kind: op.kind };
  draft.marks = [...draft.marks.filter((m) => m.id !== mark.id), mark];
}

/** Places an indication freely relative to its anchor; `null` returns it to its default spot. */
export function moveAnnotation(draft: Draft, op: OperationOf<"moveAnnotation">) {
  const annotation = draft.annotations.find((a) => a.id === op.id);
  if (!annotation) throw new Error("Indication not found.");
  if (op.offset === null) delete annotation.offset;
  else annotation.offset = { ...op.offset };
}
