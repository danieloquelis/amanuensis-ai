// Pages for the sheet reading evaluation: each engraving fixture drawn by the running app, as a
// sharp picture of the sheet alone (controls hidden), then sized like a phone photo or a scan.
import { readdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { headName, readPage } from "@/modules/page";
import { createPageImages } from "@/modules/page/server";

const FIXTURES = "tests/fixtures/engraving";
const HIDE_CONTROLS = "tests/e2e/hide-floating-controls.css";
/** Drawn at three times the screen's density (about 2,700 px wide), so close-ups keep their detail. */
const PIXEL_RATIO = 3;
const JPEG_QUALITY = 85;

export type Page = { name: string; score: unknown; png: Buffer };

/** Every fixture (or those named), drawn by the app at `base` (a running dev server). */
export async function renderPages(base: string, only: string[] = []): Promise<Page[]> {
  const names = readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .filter((name) => !only.length || only.includes(name));
  const browser = await chromium.launch();
  const pages: Page[] = [];
  try {
    for (const name of names) {
      const score = JSON.parse(readFileSync(`${FIXTURES}/${name}.json`, "utf8"));
      // Tall enough for the longest page, so no system is cut off below the window.
      const page = await browser.newPage({ viewport: { width: 1300, height: 3000 }, deviceScaleFactor: PIXEL_RATIO });
      await page.addInitScript((value) => localStorage.setItem("amanuensis.score.v1", value), JSON.stringify(score));
      await page.goto(base);
      const sheet = page.locator("svg[aria-label$='Select a note to edit.']");
      await sheet.waitFor();
      await page.waitForTimeout(500);
      const png = await sheet.screenshot({ style: readFileSync(HIDE_CONTROLS, "utf8") });
      pages.push({ name, score, png });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return pages;
}

/** The page as a JPEG data URL, its long side at most `size` pixels. */
export async function asDataUrl(png: Buffer, size: number): Promise<string> {
  const jpeg = await sharp(png)
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** Space kept around a close-up (scene units): the staff's notes above and below, a little of each neighbour bar. */
const CROP_MARGIN = { x: 12, above: 70, below: 60 };

/**
 * Close-ups of a page, `per` bars at a time within each line, as JPEG data URLs, from the scene
 * the app drew (its coordinates scale to the picture's pixels). A line's first close-up starts at
 * the left edge, so it shows the clef and key signature too.
 */
export async function closeUps(
  png: Buffer,
  scene: {
    width: number;
    systems: { top: number; staves?: { top: number }[]; bars: { x: number; endX: number; number: number }[] }[];
  },
  per: number,
  size: number,
): Promise<{ bars: [number, number]; url: string }[]> {
  const { width, height } = await sharp(png).metadata();
  const scale = width! / scene.width;
  const crops: { bars: [number, number]; url: string }[] = [];
  for (const system of scene.systems) {
    const bottom = (system.staves?.at(-1)?.top ?? system.top) + 48;
    for (let i = 0; i < system.bars.length; i += per) {
      const group = system.bars.slice(i, i + per);
      const left = i === 0 ? 0 : group[0].x - CROP_MARGIN.x;
      const right = group.at(-1)!.endX + CROP_MARGIN.x;
      const region = {
        left: Math.max(0, Math.round(left * scale)),
        top: Math.max(0, Math.round((system.top - CROP_MARGIN.above) * scale)),
        width: Math.round((right - left) * scale),
        height: Math.round((bottom - system.top + CROP_MARGIN.above + CROP_MARGIN.below) * scale),
      };
      region.width = Math.min(region.width, width! - region.left);
      region.height = Math.min(region.height, height! - region.top);
      const crop = await sharp(png).extract(region).toBuffer();
      crops.push({ bars: [group[0].number, group.at(-1)!.number], url: await asDataUrl(crop, size) });
    }
  }
  return crops;
}

const STAFF_HEIGHT = 48;
const STAFF_STEP = 6;

type SceneHead = { y: number; dx: number };
type SceneEvent = {
  x: number;
  y: number;
  staff?: number;
  heads?: SceneHead[];
  event: { pitch: unknown; drums?: unknown };
};
type SceneSystem = { top: number; clef: string; staves?: { top: number; clef: string }[]; events: SceneEvent[] };

/**
 * The page with a small red label beside every notehead naming the line or space it sits on, as a
 * machine would measure it: the letter and octave on that staff's clef, without the key signature
 * or accidentals. Here the positions come from the engraver, so they are perfect: this tests whether
 * Spark reads pitches right once it no longer has to place noteheads itself.
 */
export async function markHeads(png: Buffer, scene: { width: number; systems: SceneSystem[] }): Promise<Buffer> {
  const { width, height } = await sharp(png).metadata();
  const scale = width! / scene.width;
  const labels: string[] = [];
  for (const system of scene.systems) {
    for (const item of system.events) {
      if (!item.event.pitch || item.event.drums) continue;
      const staff = system.staves?.[item.staff ?? 0] ?? { top: system.top, clef: system.clef };
      for (const head of item.heads ?? [{ y: item.y, dx: 0 }]) {
        const name = headName(staff.clef, Math.round((staff.top + STAFF_HEIGHT - head.y) / STAFF_STEP));
        if (!name) continue;
        const x = (item.x + head.dx + 8) * scale;
        const y = (head.y + 3) * scale;
        labels.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${name}</text>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="Arial" font-size="${(7 * scale).toFixed(1)}" font-weight="bold" fill="#d01010">${labels.join("")}</g></svg>`;
  return sharp(png)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

/**
 * The page labelled by the product's page reader (modules/page), as the agent sees it: every head
 * found gets its letter and octave on its staff's clef (`clefs`, one per staff down the page), and
 * the same heads come as text, staff by staff with barlines. Null when the detector found a
 * different number of staves.
 */
export async function markDetected(
  original: Buffer,
  clefs: string[],
): Promise<{ png: Buffer; listing: string } | null> {
  const reading = await readPage(createPageImages(), original, clefs);
  if (!reading.ok) return null;
  const png = Buffer.from(reading.picture.slice(reading.picture.indexOf(",") + 1), "base64");
  return { png, listing: reading.text };
}
