import type { Gray, PageImages } from "@/modules/page";

/** A staff space in pixels: what the page reader enlarges small pages to, so a drawn page is read as is. */
export const SPACE = 28;
const TOP = 3 * SPACE;
const BOTTOM = TOP + 4 * SPACE;
const LEFT = SPACE;
const LINE = 2;
const STEM = 3.5 * SPACE;

/**
 * A one-staff page drawn into grey levels: five staff lines, filled heads with one stem up per
 * column (a chord's heads share it), and barlines. `columns` give each column's x and its heads'
 * positions (steps above the bottom line).
 */
export function drawPage(columns: { x: number; positions: number[] }[], barlines: number[], width = 30 * SPACE): Gray {
  const height = BOTTOM + 3 * SPACE;
  const data = new Uint8Array(width * height).fill(255);
  const dark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) data[Math.round(y) * width + Math.round(x)] = 0;
  };
  for (let line = 0; line < 5; line++)
    for (let x = LEFT; x < width - SPACE; x++) for (let t = 0; t < LINE; t++) dark(x, TOP + line * SPACE + t);
  const [rx, ry] = [SPACE * 0.6, SPACE * 0.42];
  for (const { x, positions } of columns) {
    for (const position of positions) {
      const cy = BOTTOM - (position * SPACE) / 2;
      for (let y = cy - ry; y <= cy + ry; y++)
        for (let px = x - rx; px <= x + rx; px++) if (((px - x) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) dark(px, y);
    }
    const lowest = BOTTOM - (Math.min(...positions) * SPACE) / 2;
    const highest = BOTTOM - (Math.max(...positions) * SPACE) / 2;
    for (let y = highest - STEM; y <= lowest; y++) for (let t = 0; t < LINE; t++) dark(x + rx * 0.9 + t, y);
  }
  for (const x of barlines) for (let y = TOP; y <= BOTTOM + LINE; y++) for (let t = 0; t < LINE; t++) dark(x + t, y);
  return { data, width, height };
}

/** Images that hand back a drawn page and record the labels drawn on it. */
export function fakeImages(page: Gray) {
  const drawn: string[] = [];
  const images: PageImages = {
    gray: async () => page,
    labelled: async (_bytes, _scale, labels) => {
      drawn.push(...labels.map((label) => label.text));
      return "data:image/jpeg;base64,bGFiZWxsZWQ=";
    },
  };
  return { images, drawn };
}
