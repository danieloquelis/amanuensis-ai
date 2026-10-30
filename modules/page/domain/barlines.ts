import type { Head } from "./heads";
import { ink, LINE_INK, type Gray } from "./pixels";
import type { Staff } from "./staves";

/** How much of its length a barline may lack in one place, in staff spaces (uneven print, an enlarged scan). */
const MAX_GAP = 0.15;
/** No barline within this many staff spaces of a head: that stroke is the head's stem. */
const STEM_REACH = 1;

/**
 * The x of every barline on each staff: a stroke from its top line to its bottom line that is no
 * head's stem. A thick or double barline is one barline; the line that opens a system is none.
 */
export function findBarlines(g: Gray, staves: Staff[], heads: Head[]): number[][] {
  return staves.map((staff, s) => {
    const found: number[] = [];
    const maxGap = Math.max(2, staff.space * MAX_GAP);
    for (let x = Math.ceil(staff.left + staff.space / 2); x <= Math.min(staff.right, g.width - 1); x++) {
      let gap = 0;
      for (let y = Math.round(staff.top); y <= Math.round(staff.bottom) && gap <= maxGap; y++)
        // Thin barlines blur to grey in a scan, as staff lines do.
        gap = ink(g, x, y, LINE_INK) ? 0 : gap + 1;
      if (gap > maxGap) continue;
      if (heads.some((head) => head.staff === s && Math.abs(head.x - x) < staff.space * STEM_REACH)) continue;
      if (found.length && x - found[found.length - 1] < staff.space) found[found.length - 1] = x;
      else found.push(x);
    }
    return found;
  });
}
