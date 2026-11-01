import { isStartMark, MARK_LABELS, type EndMark, type StartMark } from "@/modules/score";
import { STAFF_HEIGHT, type BarScene, type System } from "./scene";

/**
 * Where a bar's furniture goes: which staves its barlines and meters sit on, and where its
 * lead-sheet marks are placed. Shared by the editable sheet and every read-only rendering, so a
 * preview never drifts from the sheet.
 */

const MARK_GAP = 6;
const START_MARK_WIDTH = 22;
const END_MARK_INSET = 4;
/** Left of the bar's first column, where the section box and start marks begin. */
const MARK_LEFT_INSET = 2;
const sectionWidth = (label: string) => 12 + label.length * 9;
/** Rough italic text width, enough to keep several end marks from overlapping. */
const endMarkWidth = (kind: keyof typeof MARK_LABELS) => MARK_LABELS[kind].length * 7 + (kind === "toCoda" ? 22 : 0);

/** A staff as bar furniture needs it: its top, and how far its part's barline runs (only on a part's first staff). */
export type BarStaff = { top: number; barlineEnd?: number };

/** Every staff of a system; a single-staff system is one staff whose barline spans it. */
export const barStaves = (system: Pick<System, "top" | "staves">): BarStaff[] =>
  system.staves ?? [{ top: system.top, barlineEnd: system.top + STAFF_HEIGHT }];

/** The staves a barline starts on: one per part, running through all of that part's staves. */
export const barlineStaves = (system: Pick<System, "top" | "staves">) =>
  barStaves(system).filter((staff): staff is Required<BarStaff> => staff.barlineEnd !== undefined);

/** A mark with the x it is drawn at. */
export type PlacedMark<Kind> = { id: string; kind: Kind; x: number };

/** Lays marks out along the bar: section and start marks from the left, end marks from the right. */
export function placeBarMarks(bar: BarScene) {
  let left = bar.x + MARK_LEFT_INSET;
  const sectionX = left;
  if (bar.section) left += sectionWidth(bar.section) + MARK_GAP;
  const startMarks: PlacedMark<StartMark>[] = [];
  const endMarks: PlacedMark<EndMark>[] = [];
  for (const { id, kind } of bar.marks) {
    if (!isStartMark(kind)) continue;
    startMarks.push({ id, kind, x: left });
    left += START_MARK_WIDTH + MARK_GAP;
  }
  let right = bar.endX - END_MARK_INSET;
  for (const { id, kind } of bar.marks) {
    if (isStartMark(kind)) continue;
    endMarks.push({ id, kind, x: right });
    right -= endMarkWidth(kind) + MARK_GAP * 2;
  }
  return { sectionX, startMarks, tempoX: Math.max(left, bar.notesX), endMarks };
}

/** A bar's closing line: a final double bar only at the end of the piece, unless a repeat sign closes it. */
export const closesWithFinalBarline = (bar: Pick<BarScene, "final" | "repeatEnd">) => bar.final && !bar.repeatEnd;
