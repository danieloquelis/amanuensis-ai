import { findBarlines } from "../domain/barlines";
import { findHeads } from "../domain/heads";
import { barColumns, barsText, headName, staffItems, staffText } from "../domain/listing";
import type { Gray } from "../domain/pixels";
import { findStaves } from "../domain/staves";

/** A label drawn on the page: its text and where its baseline starts, in the enlarged picture's pixels. */
export type PageLabel = { x: number; y: number; text: string };

/** Port to the image library: decoding pictures and drawing labels on them (server-side). */
export interface PageImages {
  /** The picture in grey levels, enlarged `scale` times. */
  gray(bytes: Uint8Array, scale: number): Promise<Gray>;
  /**
   * The picture enlarged `scale` times with the labels drawn in red (`size` pixels tall), as a
   * JPEG data URL whose long side is at most `side` pixels.
   */
  labelled(bytes: Uint8Array, scale: number, labels: PageLabel[], size: number, side: number): Promise<string>;
}

/** What the detector found on a page whose staves match the reading. */
export type PageDetection = {
  ok: true;
  staves: number;
  /** The heads by name: bar by bar with each system's staves, or one line per pitched staff (`|` at barlines). */
  text: string;
  /** Per staff (down the page), each bar's columns of head names (unspelled), in order; empty for a drum staff. */
  bars: string[][][][];
  /** The page with every head labelled, as a data URL. */
  picture: string;
};
export type PageReading = PageDetection | { ok: false; staves: number; reason: string };

/** Pages are enlarged to at least this many pixels per staff space: heads big enough to find, labels to read. */
const MIN_SPACE = 28;
/** A label's height, in staff spaces, and its offset from its head's centre. */
const LABEL = { size: 1, dx: 0.7, dy: 0.35 };
/** The labelled page's long side: models scale larger pictures down anyway. */
const LABELLED_SIDE = 3000;

/**
 * Finds the staves, noteheads and barlines of a picture of printed music, names each head's line
 * or space on its staff's clef (`clefs`, one per staff down the page from the reading, or one
 * system's when every system has the same staves), and draws
 * those names on the page. With `perSystem` (staves in each system), the heads are listed bar by
 * bar, spelled in the key signature (`fifths`). A page whose staves differ from the reading is not labelled.
 */
export async function readPage(
  images: PageImages,
  bytes: Uint8Array,
  clefs: string[],
  { perSystem, fifths = 0 }: { perSystem?: number; fifths?: number } = {},
): Promise<PageReading> {
  let gray = await images.gray(bytes, 1);
  let staves = findStaves(gray);
  if (!staves.length) {
    return { ok: false, staves: 0, reason: "No staves found (a photo at an angle or handwriting): read it by eye." };
  }
  const scale = Math.max(1, MIN_SPACE / staves[0].space);
  if (scale > 1) {
    gray = await images.gray(bytes, scale);
    staves = findStaves(gray);
  }
  // The clefs of one system stand for every system when each has the same staves.
  if (staves.length !== clefs.length && staves.length % clefs.length === 0) {
    clefs = Array.from({ length: staves.length }, (_, s) => clefs[s % clefs.length]);
  }
  if (staves.length !== clefs.length) {
    const reason = `The page has ${staves.length} staves; the reading gave clefs for ${clefs.length}.`;
    return { ok: false, staves: staves.length, reason };
  }
  const heads = findHeads(gray, staves);
  const barlines = findBarlines(gray, staves, heads);
  const items = staves.map((staff, s) => staffItems(staff, s, clefs[s], heads, barlines[s]));
  const pitched = (s: number) => headName(clefs[s], 0) !== null;
  const text =
    perSystem && staves.length % perSystem === 0
      ? barsText(items, clefs, perSystem, fifths)
      : items
          .map((line, s) => (pitched(s) ? `staff ${s + 1} (${clefs[s]}): ${staffText(line, fifths)}` : null))
          .filter(Boolean)
          .join("\n");
  const labels = heads.flatMap((head) => {
    const name = headName(clefs[head.staff], head.position);
    const { space } = staves[head.staff];
    return name ? [{ x: head.x + space * LABEL.dx, y: head.y + space * LABEL.dy, text: name }] : [];
  });
  const picture = await images.labelled(bytes, scale, labels, staves[0].space * LABEL.size, LABELLED_SIDE);
  const bars = items.map((line, s) => (pitched(s) ? barColumns(line) : []));
  return { ok: true, staves: staves.length, text, bars, picture };
}
