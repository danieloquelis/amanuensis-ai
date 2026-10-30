import { bounded, closedOval, hasStem, headTall, onLedger } from "./head-shapes";
import { inkShare, type Gray } from "./pixels";
import type { Staff } from "./staves";

/** A notehead found on the page: its centre, its staff (index), and its position there (steps above the bottom line). */
export type Head = { x: number; y: number; staff: number; position: number; filled: boolean };

/** A clef is about this many staff spaces wide: no note sits within it. */
const CLEF_SPACES = 4.5;
/** Positions searched beyond the staff: four ledger lines above and below. */
const LEDGER_STEPS = 8;
/** A head's half-width and half-height, in staff spaces; a whole note is wider. */
const HEAD = { rx: 0.62, ry: 0.42 };
const WHOLE = { rx: 1.25, ry: 1.1 };
/** A filled head is at least this much ink. */
const FILLED = 0.72;
/** After a head, the search moves on this many staff spaces. */
const PAST_HEAD = 1.1;
/** One head seen at two neighbouring positions lies within this many staff spaces across. */
const TWIN = 0.6;
/** A chord's second sits within this many staff spaces of the stemmed head beside it. */
const SECOND = 1.5;

type Candidate = Head & { stem: boolean };

/** Every notehead on the given staves, filled or hollow, left to right per staff. */
export function findHeads(g: Gray, staves: Staff[]): Head[] {
  const heads: Candidate[] = [];
  staves.forEach((staff, s) => {
    const rx = staff.space * HEAD.rx;
    const ry = staff.space * HEAD.ry;
    for (let position = -LEDGER_STEPS; position <= 8 + LEDGER_STEPS; position++) {
      const y = staff.bottom - (position * staff.space) / 2;
      let x = staff.left + staff.space * CLEF_SPACES;
      while (x < staff.right) {
        const filled = inkShare(g, x, y, rx, ry, false) > FILLED;
        // A hollow head has a stem (a half note), or is a wider oval with none (a whole note).
        const half = !filled && closedOval(g, x, y, rx, ry) && hasStem(g, x, y, rx, staff.space);
        const whole =
          !filled &&
          !half &&
          closedOval(g, x, y, rx * WHOLE.rx, ry * WHOLE.ry) &&
          !hasStem(g, x, y, rx * WHOLE.rx, staff.space);
        const hollow = half || whole;
        if ((filled || hollow) && bounded(g, x, y, rx, staff.space) && onLedger(g, staff, x, position)) {
          // Slide to the blob's centre: the darkest x across it.
          let best = x;
          let bestShare = 0;
          for (let dx = 0; dx < staff.space; dx++) {
            const share = inkShare(g, x + dx, y, rx, ry, hollow);
            if (share > bestShare) [best, bestShare] = [x + dx, share];
          }
          if (filled && !headTall(g, best, y, staff.space)) {
            x += 1;
            continue;
          }
          const stem = hollow || hasStem(g, best, y, rx, staff.space);
          heads.push({ x: best, y, staff: s, position, filled, stem });
          x = best + staff.space * PAST_HEAD;
        } else x += 1;
      }
    }
  });
  return stemmedOrSecond(withoutTwins(g, heads, staves), staves);
}

/** A head seen at two neighbouring positions is one head: the stronger centre is kept (on a line it is a coin toss). */
function withoutTwins(g: Gray, heads: Candidate[], staves: Staff[]): Candidate[] {
  const strength = (h: Head) => {
    const { space } = staves[h.staff];
    return inkShare(g, h.x, h.y, space * HEAD.rx, space * HEAD.ry, !h.filled);
  };
  const kept: Candidate[] = [];
  for (const head of [...heads].sort((a, b) => a.staff - b.staff || a.x - b.x)) {
    const twin = kept.find(
      (k) =>
        k.staff === head.staff &&
        Math.abs(k.x - head.x) < staves[head.staff].space * TWIN &&
        Math.abs(k.position - head.position) === 1,
    );
    if (!twin) kept.push(head);
    else if (strength(head) > strength(twin)) kept[kept.indexOf(twin)] = head;
  }
  return kept;
}

/**
 * A filled head has a stem; one without is a digit, a flag or a dot, unless it sits a second away
 * from a stemmed head (a chord's second hangs on the far side of the stem).
 */
function stemmedOrSecond(heads: Candidate[], staves: Staff[]): Head[] {
  return heads
    .filter(
      (head) =>
        head.stem ||
        heads.some(
          (other) =>
            other.stem &&
            other.staff === head.staff &&
            Math.abs(other.position - head.position) === 1 &&
            Math.abs(other.x - head.x) < staves[head.staff].space * SECOND,
        ),
    )
    .map(({ x, y, staff, position, filled }) => ({ x, y, staff, position, filled }));
}
