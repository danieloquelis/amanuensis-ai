import { COLOR, legend, page } from "../page.mjs";

/**
 * Pitch accuracy of Muse Spark 1.3 (low thinking) reading our own engraved pages, from
 * docs/research/sheet-reading.md: notes at the right place with the right pitch.
 */
const PAGES: [name: string, without: number, detector: number][] = [
  ["dense", 12, 94],
  ["keys", 30, 97],
  ["leadsheet", 40, 100],
  ["long", 69, 95],
];
const WITHOUT = "#c3c2b7";

export function visionEval() {
  const W = 1000;
  const left = 110;
  const unit = (W - left - 60) / 100;
  const rows = PAGES.map(([name, without, detector], i) => {
    const y = 34 + i * 64;
    return `<text x="0" y="${y + 26}" font-size="14" font-weight="600">${name}</text>
      <rect x="${left}" y="${y}" width="${without * unit}" height="20" rx="3" fill="${WITHOUT}"/>
      <text x="${left + without * unit + 6}" y="${y + 15}" font-size="13" fill="${COLOR.muted}">${without}%</text>
      <rect x="${left}" y="${y + 24}" width="${detector * unit}" height="20" rx="3" fill="${COLOR.sung}"/>
      <text x="${left + detector * unit + 6}" y="${y + 39}" font-size="13" font-weight="650">${detector}%</text>`;
  });
  const grid = [0, 50, 100].map(
    (
      p,
    ) => `<line x1="${left + p * unit}" x2="${left + p * unit}" y1="24" y2="${34 + PAGES.length * 64}" stroke="${COLOR.line}"/>
      <text x="${left + p * unit}" y="16" font-size="12" fill="${COLOR.muted}" text-anchor="middle">${p}%</text>`,
  );
  return page(
    `<svg width="${W}" height="${44 + PAGES.length * 64}" font-family="inherit">${grid.join("")}${rows.join("")}</svg>
    ${legend([
      [WITHOUT, "Page alone"],
      [COLOR.sung, "Page with labels"],
    ])}`,
  );
}
