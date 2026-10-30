import type { Annotation } from "@/modules/score";
import { STAFF_HEIGHT, type System } from "./scene";
import { eventInk, staffOf, staffTop } from "./staff-layout";

const TEXT_CHARS_PER_LINE = 38;
export const TEXT_LINE_HEIGHT = 15;
const TEXT_MAX_X = 580;
/** Gap between the last text line and the marks row (or the staff when there is none). */
const TEXT_GAP_ABOVE_ROWS = 24;
export const DYNAMIC_ROW_HEIGHT = 17;
const DYNAMIC_OFFSET_BELOW_TOP = 130;
/** With several staves, a staff's dynamics sit just below it, clear of its lowest notes. */
const DYNAMIC_GAP_BELOW_STAFF = 24;
const DYNAMIC_GAP_BELOW_INK = 16;

/** Wraps at word boundaries; a word longer than a line is split. */
export function wrapText(text: string, width = TEXT_CHARS_PER_LINE): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    for (const piece of word.match(new RegExp(`.{1,${width}}`, "g")) ?? []) {
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= width) line += ` ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Lines of text indications engraved above a system; reserves space before the staff. */
export function textLineCount(annotations: Annotation[]): number {
  return annotations.filter((a) => a.kind === "text").reduce((lines, a) => lines + wrapText(a.text).length, 0);
}

/** Baseline of a staff's first row of dynamics. One staff keeps them well below, as a row of their own. */
function dynamicsY(system: System, staff: number): number {
  if (!system.staves) return system.top + DYNAMIC_OFFSET_BELOW_TOP;
  const top = staffTop(system, staff);
  const ink = system.events.filter((e) => staffOf(e) === staff && !e.hidden).map((e) => eventInk(e).bottom);
  return Math.max(top + STAFF_HEIGHT + DYNAMIC_GAP_BELOW_STAFF, ...ink.map((y) => y + DYNAMIC_GAP_BELOW_INK));
}

/**
 * Places text indications in rows above the marks and chords, and dynamics in rows below their
 * staff, anchored to their note or bar. A user offset then moves a label freely. Returns the
 * number of dynamic rows under the last staff so the next system can make room.
 */
export function layoutLabels(system: System, annotations: Annotation[]): { dynamicRows: number } {
  const reservedTextLines = textLineCount(annotations);
  const staffIds = system.staves?.map((staff) => staff.staffId) ?? [];
  let textRow = 0;
  const dynamicRows = staffIds.map(() => 0);
  if (!dynamicRows.length) dynamicRows.push(0);
  for (const annotation of annotations) {
    const event = system.events.find((e) => e.event.id === annotation.targetId);
    const bar = system.bars.find((b) => b.id === annotation.targetId);
    const x = event?.x ?? bar!.notesX;
    const dx = annotation.offset?.x ?? 0;
    const dy = annotation.offset?.y ?? 0;
    if (annotation.kind === "dynamic") {
      const staff = event ? staffOf(event) : Math.max(0, staffIds.indexOf(annotation.staffId ?? ""));
      system.labels.push({
        id: annotation.id,
        annotationId: annotation.id,
        x: x + dx,
        y: dynamicsY(system, staff) + dynamicRows[staff]++ * DYNAMIC_ROW_HEIGHT + dy,
        text: annotation.text,
        kind: "dynamic",
        ...(staff > 0 ? { staff } : {}),
      });
      continue;
    }
    const firstLineY = system.markY - TEXT_GAP_ABOVE_ROWS - (reservedTextLines - 1) * TEXT_LINE_HEIGHT;
    wrapText(annotation.text).forEach((line, index) => {
      system.labels.push({
        id: `${annotation.id}-${index}`,
        annotationId: annotation.id,
        x: Math.min(x, TEXT_MAX_X) + dx,
        y: firstLineY + textRow++ * TEXT_LINE_HEIGHT + dy,
        text: line,
        kind: "text",
      });
    });
  }
  return { dynamicRows: dynamicRows.at(-1)! };
}
