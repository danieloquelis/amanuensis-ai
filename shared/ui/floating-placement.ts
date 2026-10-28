import type { AnchorArea, AnchorRect } from "./hooks/use-anchor-rect";

/** Floating layers keep this far (px) from the area's edges and from what they point at. */
const MARGIN = 12;
const GAP = 8;

type Size = { width: number; height: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/**
 * A small pin (`size`) just below `anchor`, right-aligned with it, kept inside `area`. Below the
 * staff is the quietest place on a sheet: bar numbers, chords and marks all sit above it.
 */
export function placePin(anchor: AnchorRect, area: AnchorArea, size: Size) {
  return {
    left: clamp(anchor.right - size.width, MARGIN, area.width - size.width - MARGIN),
    top: clamp(anchor.bottom + GAP, MARGIN, area.height - size.height - MARGIN),
  };
}

/**
 * Where a panel of `size` opens beside `anchor` without covering it: below when it fits (where
 * the pin was), otherwise just above it, attached by its bottom edge so it grows upwards as
 * its content does. Lined up with the anchor's left edge and kept inside `area`.
 */
export function placeAround(
  anchor: AnchorRect,
  area: AnchorArea,
  size: Size,
): { left: number; top: number } | { left: number; bottom: number } {
  const left = clamp(anchor.left, MARGIN, area.width - size.width - MARGIN);
  const below = anchor.bottom + GAP;
  if (below + size.height <= area.height - MARGIN) return { left, top: below };
  return { left, bottom: Math.min(area.height - anchor.top + GAP, area.height - MARGIN - size.height / 2) };
}
