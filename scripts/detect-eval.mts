// How well the notehead detector finds the heads of our own pages, whose true positions the engraver
// knows. Free (no API). Usage: yarn tsx scripts/detect-eval.mts [--base http://localhost:3001] [--only a,b]
import { layoutScore } from "@/modules/engraving";
import { parseScore } from "@/modules/score";
import { detectHeads } from "./lib/notehead-detect.mjs";
import { renderPages } from "./lib/sheet-pages.mjs";

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};
const only = arg("only", "").split(",").filter(Boolean);
const STAFF_HEIGHT = 48;
const STAFF_STEP = 6;

type TrueHead = { x: number; staff: number; position: number };

console.log("page        heads found  right-place  noise  staves  secs");
for (const page of await renderPages(arg("base", "http://localhost:3001"), only)) {
  const score = parseScore(page.score);
  if (score.parts.some((p) => p.instrument === "drums")) continue;
  const scene = layoutScore(score);
  const started = Date.now();
  const { staves, heads, width } = await detectHeads(page.png);
  const scale = width / scene.width;
  // The true heads, numbered by staff down the page as the detector numbers them.
  const truth: TrueHead[] = [];
  let staffBase = 0;
  for (const system of scene.systems) {
    const tops = system.staves?.map((s) => s.top) ?? [system.top];
    for (const item of system.events) {
      if (!item.event.pitch) continue;
      const staff = item.staff ?? 0;
      for (const head of item.heads ?? [{ y: item.y, dx: 0 }]) {
        truth.push({
          x: (item.x + head.dx) * scale,
          staff: staffBase + staff,
          position: Math.round((tops[staff] + STAFF_HEIGHT - head.y) / STAFF_STEP),
        });
      }
    }
    staffBase += tops.length;
  }
  const space = STAFF_STEP * 2 * scale;
  const used = new Set<number>();
  let found = 0;
  let right = 0;
  for (const t of truth) {
    const k = heads.findIndex(
      (h, i) =>
        !used.has(i) &&
        h.staff === t.staff &&
        Math.abs(h.x - t.x) < space * 0.8 &&
        Math.abs(h.position - t.position) <= 1,
    );
    if (k === -1) continue;
    used.add(k);
    found++;
    if (heads[k].position === t.position) right++;
  }
  const noise = heads.length - used.size;
  console.log(
    `${page.name.padEnd(11)} ${String(truth.length).padStart(5)} ${`${found} (${Math.round((100 * found) / truth.length)}%)`.padStart(11)} ${`${right} (${Math.round((100 * right) / Math.max(1, found))}%)`.padStart(12)} ${String(noise).padStart(6)} ${String(staves.length).padStart(7)} ${((Date.now() - started) / 1000).toFixed(1).padStart(5)}`,
  );
}
