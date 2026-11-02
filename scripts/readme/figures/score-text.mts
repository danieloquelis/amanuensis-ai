import { readFileSync } from "node:fs";
import { parseScore, scoreText } from "@/modules/score";
import { COLOR, page } from "../page.mjs";
import type { visionData } from "../vision-data.mjs";

type Data = Awaited<ReturnType<typeof visionData>>;

const SHOWN_WIDTH = 1120;

/** Three engraved bars, each with the line of score text the agents read and write for it. */
export function scoreTextFigure(data: Data) {
  const score = parseScore(JSON.parse(readFileSync("tests/fixtures/engraving/long.json", "utf8")));
  const lines = scoreText(score).split("\n");
  const k = SHOWN_WIDTH / data.width;
  const edges = [data.staves[0].left + 4 * data.space, ...data.barlines];
  const bars = data.barlines.map((end, i) => {
    const from = edges[i] * k;
    const to = end * k;
    return `<div style="position:absolute;left:${from + 6}px;width:${to - from - 12}px;top:0;text-align:center">
      <div style="border-top:2px solid ${COLOR.ink};margin-bottom:8px"></div>
      <code style="font-size:15px">${lines[i + 1]}</code></div>`;
  });
  return page(
    `<img src="${data.page}" style="width:${SHOWN_WIDTH}px;display:block"><div style="position:relative;height:40px">${bars.join("")}</div>`,
  );
}
