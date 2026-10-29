// Builds the app's icons from the brand mark (public/brand/mark.svg): the browser-tab icon
// (app/icon.svg), the home-screen icon (app/apple-icon.png) and the fallback favicon
// (app/favicon.ico, 16, 32 and 48 px). Each is the in-app brand tile: the mark in cream on the
// green gradient. PNGs are rendered with Playwright's Chromium.
//
//   yarn icons
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = join(import.meta.dirname, "..");
const MARK = readFileSync(join(ROOT, "public/brand/mark.svg"), "utf8");

/** The brand tile's colours (see `.brandMark` in workspace.module.css). */
const GRADIENT = { from: "#6a9c76", to: "#2f5a3e" };
const INK = "#fffdf2";
const TILE = 1024;
/** Corner radius of the rounded tile, as a share of its side. */
const CORNER = 0.225;
/** How much of the tile the mark fills: larger on tiny icons so its shape survives 16 px. */
const MARK_SHARE = { large: 0.62, tiny: 0.74 };
const FAVICON_SIZES = [16, 32, 48];
const APPLE_SIZE = 180;

const [vx, vy, vw] = MARK.match(/viewBox="([^"]+)"/)![1]
  .split(" ")
  .map(Number);
const paths = [...MARK.matchAll(/<path d="[^"]+"\/>/g)].map((m) => m[0]).join("");

/** The tile as SVG: rounded for tabs, square for home screens (the system rounds them). */
function tile({ rounded, share }: { rounded: boolean; share: number }) {
  const scale = (TILE * share) / vw;
  const offset = (TILE * (1 - share)) / 2;
  const radius = rounded ? TILE * CORNER : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}">
<defs><linearGradient id="tile" x1="0.25" y1="0.07" x2="0.75" y2="0.93">
<stop offset="0" stop-color="${GRADIENT.from}"/><stop offset="1" stop-color="${GRADIENT.to}"/>
</linearGradient></defs>
<rect width="${TILE}" height="${TILE}" rx="${radius}" fill="url(#tile)"/>
<g fill="${INK}" transform="translate(${offset} ${offset}) scale(${scale}) translate(${-vx} ${-vy})">${paths}</g>
</svg>
`;
}

/** An .ico holding PNG images, one per size (supported by every current browser). */
function ico(images: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(svg: string, size: number) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

writeFileSync(join(ROOT, "app/icon.svg"), tile({ rounded: true, share: MARK_SHARE.large }));
writeFileSync(
  join(ROOT, "app/apple-icon.png"),
  await render(tile({ rounded: false, share: MARK_SHARE.large }), APPLE_SIZE),
);
const favicons = [];
for (const size of FAVICON_SIZES)
  favicons.push({ size, png: await render(tile({ rounded: true, share: MARK_SHARE.tiny }), size) });
writeFileSync(join(ROOT, "app/favicon.ico"), ico(favicons));
await browser.close();
console.log("icons: app/icon.svg, app/apple-icon.png, app/favicon.ico");
