import { durationNotation, isNote, voiceLine, type Score } from "@/modules/score";
import { stemX, type EngravedEvent, type System } from "./scene";

/** Gap between a slur's end and the notehead (or stem tip) it starts from. */
const END_GAP = { head: 8, stemTip: 4 };
/** Room kept between the arc and any note it passes over. */
const CLEARANCE = 5;
/** Half-height of a notehead, and how far a rest's ink reaches from its centre. */
const HEAD_HALF = 6;
const REST_REACH = { up: 15, down: 17 };
/** An accidental's centre sits this far left of its notehead; its ink reaches this far up and down. */
const ACCIDENTAL_CENTRE = 18;
const ACCIDENTAL_REACH: Record<number, { up: number; down: number }> = {
  1: { up: 14, down: 12 },
  0: { up: 14, down: 14 },
  [-1]: { up: 19, down: 9 },
};
/** Depth of the arc's middle by length, before it is raised over notes in the way. */
const DEPTH = { min: 6, max: 16, perUnit: 0.06 };
/** A cubic with both controls offset by `bulge` reaches 3/4 of it at the middle. */
const MIDDLE_SHARE = 0.75;
const MAX_BULGE = 60;
/** However flat a slur is shaped, it keeps this much curve. */
const MIN_BULGE = 2;
/** Where a slur continued from the previous line starts, past the line's header. */
const LINE_START_INSET = 2;
const LINE_END_CLEARANCE = 2;

const hasStem = (item: EngravedEvent) => isNote(item.event) && durationNotation(item.event.duration).base < 4;

/** Where a slur meets a note: at the head on the head side, at the stem tip on the stem side. */
function endPoint(item: EngravedEvent, above: boolean): { x: number; y: number } {
  const stemSide = hasStem(item) && item.stemDown !== above;
  if (!stemSide) return { x: item.x, y: item.y + (above ? -END_GAP.head : END_GAP.head) };
  return { x: stemX(item), y: item.stemEnd + (above ? -END_GAP.stemTip : END_GAP.stemTip) };
}

/** The outermost ink of a note or rest on the slur's side. */
function inkEdge(item: EngravedEvent, above: boolean): number {
  if (!isNote(item.event)) return item.y + (above ? -REST_REACH.up : REST_REACH.down);
  const head = item.y + (above ? -HEAD_HALF : HEAD_HALF);
  const stemOnSide = hasStem(item) && item.stemDown !== above;
  if (!stemOnSide) return head;
  return above ? Math.min(head, item.stemEnd) : Math.max(head, item.stemEnd);
}

/** Something on the slur's side the arc must pass: its x, and its outermost ink there. */
type Obstacle = { x: number; edge: number };

/** Accidentals inside a slur's span stand in its way too, including those of its end notes. */
function accidentalObstacle(item: EngravedEvent, above: boolean): Obstacle[] {
  if (item.accidental === null) return [];
  const reach = ACCIDENTAL_REACH[item.accidental];
  return [{ x: item.x - ACCIDENTAL_CENTRE, edge: item.y + (above ? -reach.up : reach.down) }];
}

/**
 * Places every slur on the systems its notes are on. A slur goes under the notes when all stems
 * point up, otherwise over them; it is raised until it clears every note and accidental it
 * passes, then by the slur's own `lift`. Across a line break each line gets its own open arc.
 */
export function placeSlurs(score: Score, systems: System[]) {
  const placed = new Map<string, { item: EngravedEvent; system: System }>();
  for (const system of systems) for (const item of system.events) placed.set(item.event.id, { item, system });
  for (const slur of score.slurs) {
    // A slur joins notes of one voice, so its notes are that voice's events between its ends.
    const order = voiceLine(score, slur.startEventId).map((e) => e.id);
    const ids = order.slice(order.indexOf(slur.startEventId), order.indexOf(slur.endEventId) + 1);
    const items = ids.flatMap((id) => (placed.has(id) ? [placed.get(id)!] : []));
    if (items.length < 2 || items.some(({ item }) => item.hidden)) continue;
    const notes = items.filter(({ item }) => isNote(item.event));
    const above = !notes.every(({ item }) => !item.stemDown);
    const bars: [number, number] = [items[0].item.measure + 1, items.at(-1)!.item.measure + 1];
    for (const system of new Set(items.map((i) => i.system))) {
      const segment = items.filter((i) => i.system === system).map((i) => i.item);
      const first = segment[0];
      const last = segment.at(-1)!;
      const start = first.event.id === slur.startEventId ? endPoint(first, above) : null;
      const end = last.event.id === slur.endEventId ? endPoint(last, above) : null;
      const from = start ?? { x: system.bars[0].x + LINE_START_INSET, y: endPoint(first, above).y };
      const to = end ?? { x: system.endX - LINE_END_CLEARANCE, y: endPoint(last, above).y };
      const inner = segment.filter((item) => !(start && item === first) && !(end && item === last));
      const obstacles = [
        ...inner.map((item) => ({ x: item.x, edge: inkEdge(item, above) })),
        ...segment.flatMap((item) => accidentalObstacle(item, above)),
      ];
      const lifted = bulgeOver(from, to, obstacles, above) + (slur.lift ?? 0) / MIDDLE_SHARE;
      system.slurs.push({
        id: `${slur.id}-${system.firstMeasure}`,
        slurId: slur.id,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        bulge: (above ? -1 : 1) * Math.max(MIN_BULGE, lifted),
        bars,
      });
    }
  }
}

/** How far the control points sit from the chord so the arc clears every obstacle. */
function bulgeOver(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: Obstacle[],
  above: boolean,
) {
  const width = to.x - from.x;
  const direction = above ? -1 : 1;
  let bulge = Math.min(DEPTH.max, Math.max(DEPTH.min, width * DEPTH.perUnit)) / MIDDLE_SHARE;
  for (const obstacle of obstacles) {
    const t = (obstacle.x - from.x) / width;
    if (t <= 0 || t >= 1) continue;
    const chord = from.y + (to.y - from.y) * t;
    const needed = direction * (obstacle.edge - chord) + CLEARANCE;
    // The curve's offset from the chord at t is 3t(1-t) times the bulge.
    bulge = Math.max(bulge, needed / (3 * t * (1 - t)));
  }
  return Math.min(bulge, MAX_BULGE);
}
