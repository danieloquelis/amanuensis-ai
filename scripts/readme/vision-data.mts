// The sheet-reading figure's data, from the real detector: an engraving fixture drawn by the
// running app (README_BASE, default http://localhost:3000), then the page module's own steps on
// it: staves, noteheads and barlines found in the pixels, and the labelled picture Muse Spark is
// shown. The drawn page is cached in .cache/readme.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp, { type Sharp } from "sharp";
import { findBarlines, findHeads, findStaves, readPage } from "@/modules/page";
import { createPageImages } from "@/modules/page/server";
import { renderPages } from "../lib/sheet-pages.mjs";

const WORK = join(".cache", "readme");
const BASE = process.env.README_BASE ?? "http://localhost:3000";
/** The page shown: twelve bars in C minor, one treble staff. */
const FIXTURE = "long";
const CLEFS = ["treble"];
const FIFTHS = -3;
/** How many staves (systems) of the page, and bars of it, the figure shows. */
const SHOWN_STAVES = 1;
const SHOWN_BARS = 3;

async function drawnPage(): Promise<Buffer> {
  const file = join(WORK, `${FIXTURE}.png`);
  if (!existsSync(file)) {
    mkdirSync(WORK, { recursive: true });
    const [page] = await renderPages(BASE, [FIXTURE]);
    writeFileSync(file, page.png);
  }
  return readFileSync(file);
}

const dataUrl = async (image: Sharp) => `data:image/png;base64,${(await image.png().toBuffer()).toString("base64")}`;

export async function visionData() {
  const png = await drawnPage();
  const images = createPageImages();
  const reading = await readPage(images, new Uint8Array(png), CLEFS, { perSystem: 1, fifths: FIFTHS });
  if (!reading.ok) throw new Error(reading.reason);
  // The detector's own steps, at the scale it reads the page at.
  let gray = await images.gray(new Uint8Array(png), 1);
  const scale = Math.max(1, 28 / findStaves(gray)[0].space);
  gray = await images.gray(new Uint8Array(png), scale);
  const staves = findStaves(gray);
  const heads = findHeads(gray, staves);
  const barlines = findBarlines(gray, staves, heads);
  // The region shown: the first staves, with room for ledger notes and labels.
  const shown = staves.slice(0, SHOWN_STAVES);
  const space = shown[0].space;
  const region = {
    left: 0,
    top: Math.max(0, Math.round(shown[0].top - 4 * space)),
    width: Math.min(gray.width, Math.round(barlines[0][SHOWN_BARS - 1] + space)),
    height: Math.round(shown.at(-1)!.bottom + 4 * space) - Math.max(0, Math.round(shown[0].top - 4 * space)),
  };
  const page = sharp(png).resize({ width: gray.width, height: gray.height }).extract(region);
  const labelled = Buffer.from(reading.picture.split(",")[1], "base64");
  const { width: lw } = await sharp(labelled).metadata();
  const k = lw! / gray.width;
  const labelledCrop = sharp(labelled).extract({
    left: 0,
    top: Math.round(region.top * k),
    width: Math.round(region.width * k),
    height: Math.round(region.height * k),
  });
  const inRegion = (y: number) => y >= region.top && y <= region.top + region.height;
  return {
    width: region.width,
    height: region.height,
    page: await dataUrl(page),
    labelled: await dataUrl(labelledCrop),
    staves: shown.map((s) => ({ top: s.top - region.top, space: s.space, left: s.left, right: s.right })),
    heads: heads
      .filter((h) => h.staff < SHOWN_STAVES && inRegion(h.y) && h.x < region.width)
      .map((h) => ({ x: h.x, y: h.y - region.top, filled: h.filled })),
    barlines: barlines[0].slice(0, SHOWN_BARS),
    space,
  };
}
