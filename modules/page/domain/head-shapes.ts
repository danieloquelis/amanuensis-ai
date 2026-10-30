import { ink, inkShare, LINE_INK, type Gray } from "./pixels";
import type { Staff } from "./staves";

// Rules from engraving that tell a notehead from other marks of its size, all in staff spaces.

/** Points sampled round a hollow head's outline. */
const RING_SAMPLES = 16;
/** Where along the radius a sample may find the outline. */
const RING_RADII = [0.7, 0.8, 0.9, 1, 1.05];
/** A hollow head's middle is light: at most this share of ink. */
const HOLLOW_INSIDE = 0.25;
/** A stem is at least this long, in staff spaces (searched up to STEM_SEARCH). */
const STEM_LENGTH = 2.5;
const STEM_SEARCH = 3;
/** Positions within the staff (and one step beyond) need no ledger line. */
const STAFF_POSITIONS = { lowest: -1, highest: 9 };
/** A beam is at least this thick, in staff spaces; a staff line is much thinner. */
const BEAM_HALF = 0.2;
/** How far beside a head (in head radii) a beam would run through it. */
const BESIDE = 1.9;

/**
 * A hollow head is a closed oval of a head's size: ink nearly all the way round (a clef's curve, a
 * digit or the gap between two beams is open somewhere) and light inside.
 */
export function closedOval(g: Gray, cx: number, cy: number, rx: number, ry: number): boolean {
  let dark = 0;
  for (let k = 0; k < RING_SAMPLES; k++) {
    const angle = (2 * Math.PI * k) / RING_SAMPLES;
    const hit = RING_RADII.some((r) =>
      ink(g, Math.round(cx + r * rx * Math.cos(angle)), Math.round(cy + r * ry * Math.sin(angle))),
    );
    if (hit) dark++;
  }
  return dark >= RING_SAMPLES - 2 && inkShare(g, cx, cy, rx * 0.35, ry * 0.35, false) < HOLLOW_INSIDE;
}

/** A stem: a long vertical stroke, up from a head's right side or down from its left (a flat's goes up on the left). */
export function hasStem(g: Gray, x: number, y: number, rx: number, space: number): boolean {
  const reach = Math.max(2, Math.round(space * 0.15));
  const run = (sx: number, direction: number) => {
    for (let dx = -reach; dx <= reach; dx++) {
      let length = 0;
      for (let k = 0; k < space * STEM_SEARCH; k++) {
        if (!ink(g, Math.round(sx + dx), Math.round(y + direction * k))) break;
        length++;
      }
      if (length >= space * STEM_LENGTH) return true;
    }
    return false;
  };
  return run(x + rx * 0.9, -1) || run(x - rx * 0.9, 1);
}

/** Beyond the staff, a head sits on or beside a ledger line (text and signs above or below the staff do not). */
export function onLedger(g: Gray, staff: Staff, x: number, position: number): boolean {
  if (position >= STAFF_POSITIONS.lowest && position <= STAFF_POSITIONS.highest) return true;
  const { space } = staff;
  const ledger = position > STAFF_POSITIONS.highest ? position - (position % 2) : position + (-position % 2);
  const y = Math.round(staff.bottom - (ledger * space) / 2);
  for (const dy of [-1, 0, 1]) {
    let run = 0;
    let covered = 0;
    for (let dx = -space; dx <= space; dx++) {
      const dark = ink(g, Math.round(x + dx), y + dy, LINE_INK);
      run = dark ? run + 1 : 0;
      if (dark) covered++;
    }
    // A ledger reaching the head's right side, or covering most of the width around it.
    if (run >= space * 1.2 || covered >= space * 1.6) return true;
  }
  return false;
}

/** A filled head is about 0.8 staff spaces tall; a beam's end, which looks like one, about half that. */
const HEAD_HEIGHT = 0.65;

/** Whether the ink through (x, y) is a head's height: unbroken from top to bottom, not a beam's end. */
export function headTall(g: Gray, x: number, y: number, space: number): boolean {
  const column = Math.round(x);
  let top = Math.round(y);
  let bottom = Math.round(y);
  while (bottom - top < space && ink(g, column, top - 1)) top--;
  while (bottom - top < space && ink(g, column, bottom + 1)) bottom++;
  return bottom - top + 1 >= space * HEAD_HEIGHT;
}

/** Ink at (x, y) that is thick (a beam), not a thin staff line. */
function thickInk(g: Gray, x: number, y: number, space: number): boolean {
  const half = Math.round(space * BEAM_HALF);
  for (let dy = -half; dy <= half; dy++) if (!ink(g, Math.round(x), Math.round(y + dy))) return false;
  return true;
}

/** Whether a notehead-sized blob at (x, y) stands on its own: not part of a beam or another thick stroke. */
export function bounded(g: Gray, x: number, y: number, rx: number, space: number): boolean {
  return !thickInk(g, x - rx * BESIDE, y, space) || !thickInk(g, x + rx * BESIDE, y, space);
}
