import { durationNotation, tiePairs, type Score } from "@/modules/score";
import type { EngravedEvent, System } from "./scene";

/** Gap between a tie's end and the notehead centre. */
const HEAD_CLEARANCE = 7;
/** A dotted note's tie starts after the dot. */
const DOT_CLEARANCE = 19;
/** Vertical offset from the notehead centre, so the arc clears the head. */
const HEAD_OFFSET = 7;
/** Where a tie broken by a line break starts on the next line, before its note. */
const CONTINUATION_LEAD = 26;
/** A broken tie runs this close to the end of the staff. */
const LINE_END_CLEARANCE = 2;

/**
 * Places every tie on the systems that hold its notes. Ties curve away from the stems: under an
 * up-stem note, over a down-stem one; where voices share a bar, toward their own side (the upper
 * voice's over, the lower voice's under). A tie across a line break is drawn as two open arcs, one
 * to the end of the first line and one into the note on the next.
 */
export function placeTies(score: Score, systems: System[]) {
  const placed = new Map<string, { item: EngravedEvent; system: System }>();
  for (const system of systems) {
    for (const item of system.events) placed.set(item.event.id, { item, system });
  }
  for (const [fromId, toId] of tiePairs(score)) {
    const from = placed.get(fromId);
    const to = placed.get(toId);
    if (!from || !to || from.item.hidden || to.item.hidden) continue;
    const above = from.item.curveSide ? from.item.curveSide === "above" : from.item.stemDown;
    const yOf = (item: EngravedEvent) => item.y + (above ? -HEAD_OFFSET : HEAD_OFFSET);
    const x1 = from.item.x + (durationNotation(from.item.event.duration).dotted ? DOT_CLEARANCE : HEAD_CLEARANCE);
    const x2 = to.item.x - HEAD_CLEARANCE;
    if (from.system === to.system) {
      from.system.ties.push({ id: fromId, x1, x2, y: yOf(from.item), above });
      continue;
    }
    from.system.ties.push({ id: fromId, x1, x2: from.system.endX - LINE_END_CLEARANCE, y: yOf(from.item), above });
    const lineStart = Math.max(to.system.bars[0].x, x2 - CONTINUATION_LEAD);
    to.system.ties.push({ id: `${fromId}-continued`, x1: lineStart, x2, y: yOf(to.item), above });
  }
}
