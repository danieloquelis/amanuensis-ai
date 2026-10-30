import { anchorIds, type KeySignature, type Score } from "@/modules/score";
import { placeAboveStaff } from "./above-staff";
import { beamBar } from "./beams";
import { headerEnd, headerMeterX, keySignatureMarks } from "./header";
import { layoutLabels } from "./labels";
import type { Line } from "./line-breaking";
import type { AnalyzedBar } from "./measure-analysis";
import { placeBar } from "./place-bar";
import type { System } from "./scene";
import { barWidth, fixedWidth } from "./spacing";
import { lineIndent, staffScenes, type StaffPlan } from "./staff-layout";

/** A short final line stays ragged rather than spreading a few notes across the page. */
const MAX_LAST_LINE_STRETCH = 2;

export type SystemContext = {
  score: Score;
  /** The widest key signature of the staves, which sets the header's width. */
  key: KeySignature;
  bars: AnalyzedBar[];
  staves: StaffPlan[];
  available: (start: number) => number;
};

/** Lays out one line of music with its staves' top lines at `tops`: bars, beams, rows above, labels. */
export function layoutSystem(
  context: SystemContext,
  line: Line,
  tops: number[],
  isLastLine: boolean,
): { system: System; dynamicRows: number } {
  const { score, key, bars, staves } = context;
  const lineBars = bars.slice(line.start, line.end);
  const [top] = tops;
  const indent = lineIndent(staves, line.start === 0);
  const system: System = {
    top,
    ...(staves.length > 1 ? { staves: staffScenes(staves, tops, indent, line.start === 0) } : {}),
    ...(indent ? { indent } : {}),
    firstMeasure: line.start,
    endX: 0,
    clef: staves[0].clef,
    keySignature: keySignatureMarks(staves[0].key, top, staves[0].clef, indent),
    bars: [],
    events: [],
    beams: [],
    beamedIds: [],
    ties: [],
    slurs: [],
    labels: [],
    chords: [],
    chordY: top,
    markY: top,
  };
  const stretch = isLastLine ? Math.min(line.stretch, MAX_LAST_LINE_STRETCH) : line.stretch;
  const justified = stretch === line.stretch && stretch > 0;
  const widths = lineBarWidths(lineBars, stretch, justified ? context.available(line.start) : null);
  let x = headerEnd(key, lineBars[0], indent);
  lineBars.forEach((bar, index) => {
    const placed = placeBar(bar, {
      x,
      width: widths[index],
      tops,
      atLineStart: index === 0,
      headerMeterX: headerMeterX(key, indent),
      final: bar.index === bars.length - 1,
    });
    system.bars.push(placed.scene);
    system.events.push(...placed.events);
    system.beams.push(...beamBar(bar, placed.events, tops));
    system.beamedIds.push(...bar.beamGroups.flat().map((i) => bar.events[i].event.id));
    x += widths[index];
  });
  system.endX = x;
  placeAboveStaff(system, score);
  const anchors = anchorIds(lineBars.map((bar) => bar.measure));
  const { dynamicRows } = layoutLabels(
    system,
    score.annotations.filter((a) => anchors.has(a.targetId)),
  );
  return { system, dynamicRows };
}

/**
 * Each bar's width on its line. Fixed-width bars keep their width. When justifying, the last
 * flexible bar absorbs the solver's rounding error so the line ends exactly at the margin.
 */
function lineBarWidths(lineBars: AnalyzedBar[], stretch: number, justifyTo: number | null): number[] {
  const fixed = lineBars.map((bar, index) => fixedWidth(bar, index === 0));
  const widths = lineBars.map((bar, index) => fixed[index] ?? barWidth(bar, stretch, index === 0));
  const lastFlexible = fixed.lastIndexOf(null);
  if (justifyTo !== null && lastFlexible !== -1) {
    widths[lastFlexible] += justifyTo - widths.reduce((sum, width) => sum + width, 0);
  }
  return widths;
}
