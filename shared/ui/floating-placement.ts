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
 * Where a panel of `size` opens next to `anchor` without covering it: below when it fits (where
 * the pin was), otherwise just above it, attached by its bottom edge so it grows upwards as its
 * content does; lined up with the anchor's left edge. With room for neither, it opens to the
 * anchor's side. The bottom `reserved` px belong to something else (the compose bar and its
 * chat): the panel always ends above them, even when the anchor itself is down there.
 */
export function placeAround(
  anchor: AnchorRect,
  area: AnchorArea,
  size: Size,
  reserved = 0,
): { left: number; top: number } | { left: number; bottom: number } {
  const floor = area.height - reserved - MARGIN;
  const left = clamp(anchor.left, MARGIN, area.width - size.width - MARGIN);
  const below = anchor.bottom + GAP;
  if (below + size.height <= floor) return { left, top: below };
  const above = Math.min(anchor.top - GAP, floor);
  if (above - size.height >= MARGIN) return { left, bottom: area.height - above };
  const right = anchor.right + GAP;
  const side = right + size.width <= area.width - MARGIN ? right : anchor.left - GAP - size.width;
  return {
    left: clamp(side, MARGIN, area.width - size.width - MARGIN),
    top: clamp(anchor.top, MARGIN, floor - size.height),
  };
}
