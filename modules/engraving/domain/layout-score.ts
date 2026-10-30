import type { Score } from "@/modules/score";
import { barNumberTop, systemCeiling } from "./above-staff";
import { writtenView } from "./clefs";
import { headerEnd } from "./header";
import { DYNAMIC_ROW_HEIGHT } from "./labels";
import { layoutSystem, type SystemContext } from "./layout-system";
import { breakLines } from "./line-breaking";
import { analyzeScore } from "./measure-analysis";
import { placeSlurs } from "./slurs";
import { placeTies } from "./ties";
import { LINE_END, SCENE_WIDTH, STAFF_HEIGHT, SYSTEM_HEIGHT, type Scene, type System } from "./scene";
import { baseTops, lineIndent, spacedTops, staffPlan, systemBottom, widestKey } from "./staff-layout";

const FIRST_SYSTEM_TOP = 90;
const SCENE_BOTTOM_TRIM = 15;
/** How far above its staff a system may reach before it is moved down. */
const HEADROOM = 82;
/** The first line's bar number, at the left edge, keeps below the tempo line drawn over the top of the sheet. */
const FIRST_BAR_NUMBER_CEILING = 22;

/** How the sheet is shown: `concertPitch` draws transposing parts as they sound rather than as written. */
export type LayoutOptions = { concertPitch?: boolean };

/**
 * Derives the engraved scene from a score revision. Pure and deterministic, in stages:
 * analyze bars → break into lines → per line: justify and place, beam, stack the rows above the
 * staff, place labels. Ties and slurs are placed last, as they may span lines. A line whose
 * content reaches too high is laid out again lower down; with several staves, a line is laid out
 * again with its staves moved apart where their notes would come too close.
 */
export function layoutScore(stored: Score, { concertPitch = false }: LayoutOptions = {}): Scene {
  const { score, outOfRange, sounding, staffKeys } = writtenView(stored, concertPitch);
  const staves = staffPlan(score, staffKeys);
  const key = widestKey(staves);
  const bars = analyzeScore(score, staffKeys);
  const context: SystemContext = {
    score,
    key,
    bars,
    staves,
    available: (start) => LINE_END - headerEnd(key, bars[start], lineIndent(staves, start === 0)),
  };
  const lines = breakLines(bars, context.available);
  const systems: System[] = [];
  let nextTop = FIRST_SYSTEM_TOP;
  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    let tops = baseTops(staves, nextTop);
    let laid = layoutSystem(context, line, tops, isLast);
    if (staves.length > 1) {
      tops = spacedTops(laid.system, staves, tops);
      laid = layoutSystem(context, line, tops, isLast);
    }
    const overflow = Math.max(
      nextTop - HEADROOM - systemCeiling(laid.system),
      index === 0 ? FIRST_BAR_NUMBER_CEILING - barNumberTop(laid.system) : 0,
    );
    if (overflow > 0)
      laid = layoutSystem(
        context,
        line,
        tops.map((top) => top + overflow),
        isLast,
      );
    systems.push(laid.system);
    const lastTop = systemBottom(laid.system) - STAFF_HEIGHT;
    nextTop = lastTop + SYSTEM_HEIGHT + laid.dynamicRows * DYNAMIC_ROW_HEIGHT;
  });
  placeTies(score, systems);
  placeSlurs(score, systems);
  for (const item of systems.flatMap((system) => system.events)) {
    if (outOfRange.has(item.event.id)) item.outOfRange = true;
    const sounds = sounding.get(item.event.id);
    if (sounds) item.sounds = sounds;
  }
  return { width: SCENE_WIDTH, height: nextTop - SCENE_BOTTOM_TRIM, systems };
}
