import type { Annotation } from "@/modules/score";
import type { System } from "./scene";

const TEXT_CHARS_PER_LINE = 38;
export const TEXT_LINE_HEIGHT = 15;
const TEXT_MAX_X = 580;
const TEXT_OFFSET_ABOVE_STAFF = 70;
export const DYNAMIC_ROW_HEIGHT = 17;
const DYNAMIC_OFFSET_BELOW_TOP = 130;

const wrapText = (text: string) => text.match(new RegExp(`.{1,${TEXT_CHARS_PER_LINE}}`, "g")) ?? [];

/** Lines of text indications engraved above a system; reserves space before the staff. */
export function textLineCount(annotations: Annotation[]): number {
  return annotations
    .filter((a) => a.kind === "text")
    .reduce((lines, a) => lines + Math.ceil(a.text.length / TEXT_CHARS_PER_LINE), 0);
}

/**
 * Places text indications in rows above the staff and dynamics in rows below it, anchored to
 * their note or bar. Returns the number of dynamic rows so the next system can make room.
 */
export function layoutLabels(system: System, annotations: Annotation[]): { dynamicRows: number } {
  const reservedTextLines = textLineCount(annotations);
  let textRow = 0;
  let dynamicRow = 0;
  for (const annotation of annotations) {
    const event = system.events.find((e) => e.event.id === annotation.targetId);
    const bar = system.bars.find((b) => b.id === annotation.targetId);
    const x = event?.x ?? bar!.notesX;
    if (annotation.kind === "dynamic") {
      system.labels.push({
        id: annotation.id,
        annotationId: annotation.id,
        x,
        y: system.top + DYNAMIC_OFFSET_BELOW_TOP + dynamicRow++ * DYNAMIC_ROW_HEIGHT,
        text: annotation.text,
        kind: "dynamic",
      });
      continue;
    }
    const firstLineY = system.top - TEXT_OFFSET_ABOVE_STAFF - reservedTextLines * TEXT_LINE_HEIGHT;
    wrapText(annotation.text).forEach((line, index) => {
      system.labels.push({
        id: `${annotation.id}-${index}`,
        annotationId: annotation.id,
        x: Math.min(x, TEXT_MAX_X),
        y: firstLineY + textRow++ * TEXT_LINE_HEIGHT,
        text: line,
        kind: "text",
      });
    });
  }
  return { dynamicRows: dynamicRow };
}
