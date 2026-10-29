import { scoreKey, type Score } from "@/modules/score";
import { systemCeiling } from "./above-staff";
import { headerEnd } from "./header";
import { DYNAMIC_ROW_HEIGHT } from "./labels";
import { layoutSystem, type SystemContext } from "./layout-system";
import { breakLines } from "./line-breaking";
import { analyzeScore } from "./measure-analysis";
import { placeSlurs } from "./slurs";
import { placeTies } from "./ties";
import { LINE_END, SCENE_WIDTH, SYSTEM_HEIGHT, type Scene, type System } from "./scene";

const FIRST_SYSTEM_TOP = 90;
const SCENE_BOTTOM_TRIM = 15;
/** How far above its staff a system may reach before it is moved down. */
const HEADROOM = 82;

/**
 * Derives the engraved scene from a score revision. Pure and deterministic, in stages:
 * analyze bars → break into lines → per line: justify and place, beam, stack the rows above the
 * staff, place labels. Ties and slurs are placed last, as they may span lines. A line whose content reaches too high is laid out again lower down.
 */
export function layoutScore(score: Score): Scene {
  const key = scoreKey(score);
  const bars = analyzeScore(score);
  const context: SystemContext = {
    score,
    key,
    bars,
    available: (start) => LINE_END - headerEnd(key, bars[start]),
  };
  const lines = breakLines(bars, context.available);
  const systems: System[] = [];
  let nextTop = FIRST_SYSTEM_TOP;
  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    let laid = layoutSystem(context, line, nextTop, isLast);
    const overflow = nextTop - HEADROOM - systemCeiling(laid.system);
    if (overflow > 0) laid = layoutSystem(context, line, nextTop + overflow, isLast);
    systems.push(laid.system);
    nextTop = laid.system.top + SYSTEM_HEIGHT + laid.dynamicRows * DYNAMIC_ROW_HEIGHT;
  });
  placeTies(score, systems);
  placeSlurs(score, systems);
  return { width: SCENE_WIDTH, height: nextTop - SCENE_BOTTOM_TRIM, systems };
}
