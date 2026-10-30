import { ink, LINE_INK, type Gray } from "./pixels";

/** A five-line staff on the page: its outer lines' y, the distance between lines, and its extent. */
export type Staff = { top: number; bottom: number; space: number; left: number; right: number };

/** A staff line runs at least this share of the page's width. */
const LINE_SHARE = 0.35;
/** Short runs (ink around a note) do not count toward a staff line; longer ones do. */
const MIN_LINE_RUN = 24;
/** Rows this close (pixels) are one thick line. */
const LINE_THICKNESS = 2;
/** Five lines make a staff when every gap is within this share of their mean. */
const EVEN_GAPS = 1 / 5;

type Line = { y: number; left: number; right: number };

/**
 * Rows that are part of a staff line, grouped into lines (centre y and extent). A row is a line
 * when long dark runs cover enough of it, gaps allowed: a hollow head on a line breaks it.
 */
function staffLines(g: Gray): Line[] {
  const rows: Line[] = [];
  for (let y = 0; y < g.height; y++) {
    let run = 0;
    let covered = 0;
    let left = -1;
    let right = -1;
    for (let x = 0; x <= g.width; x++) {
      if (x < g.width && ink(g, x, y, LINE_INK)) {
        run++;
        continue;
      }
      if (run >= MIN_LINE_RUN) {
        covered += run;
        if (left === -1) left = x - run;
        right = x - 1;
      }
      run = 0;
    }
    if (covered > g.width * LINE_SHARE) rows.push({ y, left, right });
  }
  const lines: Line[] = [];
  for (const row of rows) {
    const last = lines.at(-1);
    if (last && row.y - last.y <= LINE_THICKNESS) {
      last.y = (last.y + row.y) / 2;
      last.left = Math.min(last.left, row.left);
      last.right = Math.max(last.right, row.right);
    } else lines.push({ ...row });
  }
  return lines;
}

/** The page's staves, top to bottom: five evenly spaced long lines each. */
export function findStaves(g: Gray): Staff[] {
  const lines = staffLines(g);
  const found: Staff[] = [];
  for (let i = 0; i + 4 < lines.length;) {
    const five = lines.slice(i, i + 5);
    const gaps = five.slice(1).map((line, k) => line.y - five[k].y);
    const space = gaps.reduce((a, b) => a + b, 0) / 4;
    if (gaps.every((gap) => Math.abs(gap - space) < space * EVEN_GAPS)) {
      found.push({
        top: five[0].y,
        bottom: five[4].y,
        space,
        left: Math.min(...five.map((l) => l.left)),
        right: Math.max(...five.map((l) => l.right)),
      });
      i += 5;
    } else i++;
  }
  return found;
}
