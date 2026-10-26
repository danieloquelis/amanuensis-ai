/** Marks drawn at the start of a bar: jump targets. */
export const START_MARKS = ["segno", "coda"] as const;
/** Marks drawn at the end of a bar: where to stop or jump after it. */
export const END_MARKS = ["fine", "toCoda", "dc", "dcAlFine", "dcAlCoda", "ds", "dsAlFine", "dsAlCoda"] as const;
export const MARK_KINDS = [...START_MARKS, ...END_MARKS] as const;
export type StartMark = (typeof START_MARKS)[number];
export type EndMark = (typeof END_MARKS)[number];
export type MarkKind = (typeof MARK_KINDS)[number];

export const isStartMark = (kind: MarkKind): kind is StartMark => (START_MARKS as readonly string[]).includes(kind);

export const MARK_LABELS: Record<StartMark | EndMark, string> = {
  segno: "Segno",
  coda: "Coda",
  fine: "Fine",
  toCoda: "To Coda",
  dc: "D.C.",
  dcAlFine: "D.C. al Fine",
  dcAlCoda: "D.C. al Coda",
  ds: "D.S.",
  dsAlFine: "D.S. al Fine",
  dsAlCoda: "D.S. al Coda",
};

/** End marks that send the performer back (to the start or the segno). */
export const JUMP_MARKS: readonly EndMark[] = ["dc", "dcAlFine", "dcAlCoda", "ds", "dsAlFine", "dsAlCoda"];

export const SECTION_LABEL_MAX = 16;

/** Next rehearsal letter after the ones already used: A, B, … Z, then AA. */
export function nextSectionLabel(used: string[]): string {
  for (let i = 0; i < 52; i++) {
    const label =
      i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + i - 26)}${String.fromCharCode(65 + i - 26)}`;
    if (!used.includes(label)) return label;
  }
  return "A";
}
