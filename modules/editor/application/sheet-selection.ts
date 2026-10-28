import { findEvent, formatChord, MARK_LABELS, pitchName, type Score } from "@/modules/score";
import type { SheetItem } from "./notation-edits";

/** Something picked on the sheet: a note or rest, a whole bar, or another item (chord, text…). */
export type SheetRef = { kind: "event"; id: string } | { kind: "bar"; id: string } | SheetItem;

/** Shift extends a range from the first pick; ⌘/Ctrl adds or removes one item. */
export type PickMode = "range" | "toggle";

/** A short text is shown whole; longer ones are cut here with an ellipsis. */
const TEXT_NAME_LENGTH = 14;
/** More bars than this are counted rather than listed ("5 bars"). */
const LISTED_BARS = 3;

export const sameRef = (a: SheetRef, b: SheetRef) => a.kind === b.kind && a.id === b.id;

/** ⌘/Ctrl-click: adds the item at the end (it becomes the primary pick), or removes it. */
export function toggleRef(refs: SheetRef[], ref: SheetRef): SheetRef[] {
  return refs.some((r) => sameRef(r, ref)) ? refs.filter((r) => !sameRef(r, ref)) : [...refs, ref];
}

/**
 * Shift-click: every note (across bars) or every bar from `anchor` to `target`, in score order,
 * ending with `target`. Other kinds, or a different kind from the anchor, pick just the target.
 */
export function rangeOfRefs(score: Score, anchor: SheetRef | undefined, target: SheetRef): SheetRef[] {
  if (!anchor || anchor.kind !== target.kind || (target.kind !== "event" && target.kind !== "bar")) return [target];
  const order =
    target.kind === "bar" ? score.measures.map((m) => m.id) : score.measures.flatMap((m) => m.events.map((e) => e.id));
  const from = order.indexOf(anchor.id);
  const to = order.indexOf(target.id);
  if (from === -1 || to === -1) return [target];
  const ids = from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1).reverse();
  return ids.map((id) => ({ kind: target.kind, id }) as SheetRef);
}

const barNumber = (score: Score, measureId: string) => score.measures.findIndex((m) => m.id === measureId) + 1;

/** Whether a picked item still exists in the score (an edit may have removed it). */
export function refExists(score: Score, ref: SheetRef): boolean {
  switch (ref.kind) {
    case "event":
      return findEvent(score, ref.id) !== null;
    case "bar":
      return barNumber(score, ref.id) > 0;
    case "section":
      return !!score.measures.find((m) => m.id === ref.id)?.section;
    case "chord":
      return score.chords.some((c) => c.id === ref.id);
    case "annotation":
      return score.annotations.some((a) => a.id === ref.id);
    case "mark":
      return score.marks.some((m) => m.id === ref.id);
    case "repeat":
      return score.repeats.some((r) => r.id === ref.id);
  }
}

/** A short, speakable name for one picked item: "Bar 23", "E4 · bar 2", "Chord Am7 · bar 2". */
export function refName(score: Score, ref: SheetRef): string {
  switch (ref.kind) {
    case "event": {
      const found = findEvent(score, ref.id);
      if (!found) return "Note";
      return `${found.event.pitch ? pitchName(found.event.pitch) : "Rest"} · bar ${found.measureIndex + 1}`;
    }
    case "bar":
      return `Bar ${barNumber(score, ref.id)}`;
    case "section":
      return `Section ${score.measures.find((m) => m.id === ref.id)?.section ?? ""} · bar ${barNumber(score, ref.id)}`;
    case "chord": {
      const chord = score.chords.find((c) => c.id === ref.id);
      return chord ? `Chord ${formatChord(chord)} · bar ${barNumber(score, chord.measureId)}` : "Chord";
    }
    case "annotation": {
      const text = score.annotations.find((a) => a.id === ref.id)?.text ?? "";
      return `Text “${text.length > TEXT_NAME_LENGTH ? `${text.slice(0, TEXT_NAME_LENGTH)}…` : text}”`;
    }
    case "mark": {
      const mark = score.marks.find((m) => m.id === ref.id);
      return mark ? `${MARK_LABELS[mark.kind]} · bar ${barNumber(score, mark.measureId)}` : "Mark";
    }
    case "repeat": {
      const repeat = score.repeats.find((r) => r.id === ref.id);
      if (!repeat) return "Repeat";
      return `Repeat · bars ${barNumber(score, repeat.startMeasureId)}–${barNumber(score, repeat.endMeasureId)}`;
    }
  }
}

/** "3–6" for consecutive numbers, else "2, 5, 7". */
function numberList(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return consecutive ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(", ");
}

/**
 * The name of everything picked, for the composer and the chat: one item by its own name,
 * several bars as "Bars 3–6", several notes as "4 notes · bars 2–3", a mix as "3 items".
 */
export function selectionName(score: Score, refs: SheetRef[]): string | null {
  if (!refs.length) return null;
  if (refs.length === 1) return refName(score, refs[0]);
  if (refs.every((r) => r.kind === "bar")) {
    const numbers = refs.map((r) => barNumber(score, r.id));
    return numbers.length > LISTED_BARS && !numberList(numbers).includes("–")
      ? `${numbers.length} bars`
      : `Bars ${numberList(numbers)}`;
  }
  if (refs.every((r) => r.kind === "event")) {
    const bars = [...new Set(refs.map((r) => (findEvent(score, r.id)?.measureIndex ?? 0) + 1))];
    return `${refs.length} notes · ${bars.length === 1 ? `bar ${bars[0]}` : `bars ${numberList(bars)}`}`;
  }
  return `${refs.length} items`;
}
