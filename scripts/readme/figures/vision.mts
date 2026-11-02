import { page } from "../page.mjs";
import type { visionData } from "../vision-data.mjs";

type Data = Awaited<ReturnType<typeof visionData>>;

const SHOWN_WIDTH = 1120;
const FOUND = "#1baf7a";
const HEAD = { rx: 0.62, ry: 0.42 };

/** The page with what the detector found drawn over it: staff lines, barlines, noteheads. */
function found(data: Data) {
  const lines = data.staves.flatMap((s) =>
    [0, 1, 2, 3, 4].map(
      (i) =>
        `<line x1="${s.left}" x2="${data.width}" y1="${s.top + i * s.space}" y2="${s.top + i * s.space}" stroke="${FOUND}" stroke-width="5" opacity=".75"/>`,
    ),
  );
  const s = data.staves[0];
  const bars = data.barlines.map(
    (x) =>
      `<line x1="${x}" x2="${x}" y1="${s.top - 8}" y2="${s.top + 4 * s.space + 8}" stroke="${FOUND}" stroke-width="9" opacity=".75"/>`,
  );
  const heads = data.heads.map(
    (h) =>
      `<ellipse cx="${h.x}" cy="${h.y}" rx="${HEAD.rx * data.space + 6}" ry="${HEAD.ry * data.space + 6}" fill="none" stroke="#e34948" stroke-width="5"/>`,
  );
  return `<div style="position:relative;line-height:0"><img src="${data.page}" style="width:${SHOWN_WIDTH}px;opacity:.45">
    <svg viewBox="0 0 ${data.width} ${data.height}" style="position:absolute;inset:0;width:100%;height:100%">${lines.join("")}${bars.join("")}${heads.join("")}</svg></div>`;
}

const step = (label: string, content: string) =>
  `<div style="margin-top:14px"><div style="font-size:15px;font-weight:650;margin-bottom:6px">${label}</div>${content}</div>`;

export function vision(data: Data) {
  return page(
    step("Input", `<img src="${data.page}" style="width:${SHOWN_WIDTH}px;display:block">`) +
      step("Detected", found(data)) +
      step("Sent to Muse Spark", `<img src="${data.labelled}" style="width:${SHOWN_WIDTH}px;display:block">`),
  );
}
