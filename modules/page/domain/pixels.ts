/** A picture in grey levels, row by row: 0 is black ink, 255 white paper. */
export type Gray = { data: Uint8Array; width: number; height: number };

/** Pixels darker than this are ink. */
export const INK = 140;
/** Staff lines may be printed lighter (grey), so they get their own threshold. */
export const LINE_INK = 215;

/** Whether (x, y) is ink; outside the picture is paper. */
export function ink(g: Gray, x: number, y: number, threshold = INK): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height && g.data[y * g.width + x] < threshold;
}

/** Share of ink in an ellipse (or its ring) centred at (cx, cy). */
export function inkShare(g: Gray, cx: number, cy: number, rx: number, ry: number, ring: boolean): number {
  let inside = 0;
  let dark = 0;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1 || (ring && d < 0.45)) continue;
      inside++;
      if (ink(g, x, y)) dark++;
    }
  return inside ? dark / inside : 0;
}
