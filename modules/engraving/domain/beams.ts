import { durationNotation } from "@/modules/score";
import type { AnalyzedBar } from "./measure-analysis";
import { MIDDLE_LINE, positionY, STAFF_GAP, STEM_LENGTH, stemX, type Beam, type EngravedEvent } from "./scene";

/** Beam thickness is half a space; secondary beams sit a quarter space further in. */
export const BEAM_THICKNESS = STAFF_GAP / 2;
const SECONDARY_BEAM_OFFSET = STAFF_GAP * 0.75;
const BEAM_STUB_LENGTH = 12;
/** A beam rises at most one staff space, and never steeper than this slope. */
const MAX_RISE = STAFF_GAP;
const MAX_SLOPE = 0.3;

const isSixteenth = (item: EngravedEvent | undefined) =>
  item !== undefined && durationNotation(item.event.duration).base === 0.25;

/** Draws the beams of one placed bar and sets each beamed note's stem to meet its beam. */
export function beamBar(analyzed: AnalyzedBar, events: EngravedEvent[], top: number): Beam[] {
  return analyzed.beamGroups.flatMap((indexes) =>
    beamGroup(
      indexes.map((i) => events[i]),
      top,
    ),
  );
}

function beamGroup(group: EngravedEvent[], top: number): Beam[] {
  const down = group[0].stemDown;
  const first = group[0];
  const last = group[group.length - 1];
  const x0 = stemX(first);
  const slope = beamSlope(group, x0, stemX(last) - x0);
  const minimumStem = STEM_LENGTH + (group.some(isSixteenth) ? SECONDARY_BEAM_OFFSET / 2 : 0);
  // Anchor the beam on the note that would otherwise get the shortest stem.
  // A chord's up-stem starts from its top note.
  let intercept = down
    ? Math.max(...group.map((e) => e.y + minimumStem - slope * (stemX(e) - x0)))
    : Math.min(...group.map((e) => (e.chordTop ?? e.y) - minimumStem - slope * (stemX(e) - x0)));
  // Groups on ledger lines still reach the middle line.
  const middleY = positionY(top, MIDDLE_LINE);
  const midBeamY = intercept + slope * ((stemX(last) - x0) / 2);
  if (down && midBeamY < middleY) intercept += middleY - midBeamY;
  if (!down && midBeamY > middleY) intercept -= midBeamY - middleY;

  const beamY = (x: number) => intercept + slope * (x - x0);
  for (const item of group) item.stemEnd = beamY(stemX(item));
  const segment = (x1: number, x2: number, level: number, inset = 0): Beam => ({
    x1,
    y1: beamY(x1) + inset,
    x2,
    y2: beamY(x2) + inset,
    level,
    down,
  });

  const beams = [segment(x0, stemX(last), 1)];
  const inset = down ? -SECONDARY_BEAM_OFFSET : SECONDARY_BEAM_OFFSET;
  group.forEach((item, index) => {
    if (!isSixteenth(item)) return;
    const next = group[index + 1];
    const previous = group[index - 1];
    if (isSixteenth(next)) beams.push(segment(stemX(item), stemX(next), 2, inset));
    else if (!isSixteenth(previous)) {
      // A lone sixteenth gets a stub pointing toward its neighbour.
      const stub = next ? BEAM_STUB_LENGTH : -BEAM_STUB_LENGTH;
      beams.push(segment(stemX(item), stemX(item) + stub, 2, inset));
    }
  });
  return beams;
}

/**
 * Follows the direction from the first to the last note, but gently: half the interval, capped.
 * Flat when an inner note is more extreme than both ends (a concave contour).
 */
function beamSlope(group: EngravedEvent[], x0: number, span: number): number {
  if (span <= 0) return 0;
  const ends = [group[0].y, group[group.length - 1].y];
  const inner = group.slice(1, -1).map((e) => e.y);
  const down = group[0].stemDown;
  const concave = down ? inner.some((y) => y > Math.max(...ends)) : inner.some((y) => y < Math.min(...ends));
  if (concave) return 0;
  const rise = Math.max(-MAX_RISE, Math.min(MAX_RISE, (ends[1] - ends[0]) / 2));
  return Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, rise / span));
}
