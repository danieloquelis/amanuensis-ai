import { INSTRUMENTS, isNote, scoreKey, type Clef, type KeySignature, type Score } from "@/modules/score";
import { ARTICULATION_HALF_HEIGHT, articulationPlace } from "./articulation";
import { keySignatureMarks } from "./header";
import { STAFF_HEIGHT, STAFF_LEFT, type EngravedEvent, type StaffScene, type System } from "./scene";

/**
 * The staves of a system, top down. A piano's two staves are joined by a brace and sit closer
 * together than two instruments do; each staff moves further down when the notes, stems or
 * dynamics of the staff above would come too close. With several parts the staves start further
 * right, leaving room for the names: in full on the first system, abbreviated after.
 */

/** Top line to top line: within a part (a grand staff), and between parts. */
const STAFF_DISTANCE = { inPart: 108, betweenParts: 120 };
/** The least room between the lowest ink of one staff and the highest of the next. */
const MIN_STAFF_CLEARANCE = 24;
export const NAME_INDENT = { first: 80, later: 44 };
/** The name sits this far left of the staves (clear of a brace), and this far below their middle (text baseline). */
const NAME_GAP = 22;
const NAME_BASELINE = 4;
/** A notehead's half height. */
const HEAD_HALF_HEIGHT = 8;

/** One staff of the score, in system order. */
export type StaffPlan = {
  staffId: string;
  clef: Clef;
  key: KeySignature;
  /** First and last staff of its part. */
  partFirst: boolean;
  partLast: boolean;
  /** The part's staff count, on its first staff. */
  partStaves: number;
  name: string;
  abbreviation: string;
};

export function staffPlan(score: Score, staffKeys: Map<string, KeySignature>): StaffPlan[] {
  return score.parts.flatMap((part) =>
    part.staves.map((staff, index) => ({
      staffId: staff.id,
      clef: staff.clef,
      key: staffKeys.get(staff.id) ?? scoreKey(score),
      partFirst: index === 0,
      partLast: index === part.staves.length - 1,
      partStaves: part.staves.length,
      name: part.name,
      abbreviation: part.abbreviation ?? INSTRUMENTS[part.instrument].abbreviation,
    })),
  );
}

/** Room for part names, when there is more than one part. */
export function lineIndent(plan: StaffPlan[], firstLine: boolean): number {
  const parts = plan.filter((staff) => staff.partFirst).length;
  if (parts < 2) return 0;
  return firstLine ? NAME_INDENT.first : NAME_INDENT.later;
}

/** The key with the most accidentals: the header is as wide as its widest key signature. */
export const widestKey = (plan: StaffPlan[]): KeySignature =>
  plan.reduce(
    (widest, staff) => (Math.abs(staff.key.fifths) > Math.abs(widest.fifths) ? staff.key : widest),
    plan[0].key,
  );

/** Each staff's top at the base distances, from the first at `top`. */
export function baseTops(plan: StaffPlan[], top: number): number[] {
  const tops = [top];
  for (let i = 1; i < plan.length; i++) {
    tops.push(tops[i - 1] + (plan[i].partFirst ? STAFF_DISTANCE.betweenParts : STAFF_DISTANCE.inPart));
  }
  return tops;
}

/** The staff an event is on. */
export const staffOf = (item: Pick<EngravedEvent, "staff">) => item.staff ?? 0;

/** Y of a staff's top line in a system. */
export const staffTop = (system: Pick<System, "top" | "staves">, staff = 0) =>
  system.staves?.[staff]?.top ?? system.top;

/** Y of the system's lowest staff line. */
export const systemBottom = (system: Pick<System, "top" | "staves">) =>
  (system.staves?.at(-1)?.top ?? system.top) + STAFF_HEIGHT;

/** How far an event's ink reaches up and down: heads, stem, articulation. */
export function eventInk(item: EngravedEvent, staffTopY: number): { top: number; bottom: number } {
  const ys = [item.y, ...(item.heads?.map((h) => h.y) ?? [])];
  let top = Math.min(...ys) - HEAD_HALF_HEIGHT;
  let bottom = Math.max(...ys) + HEAD_HALF_HEIGHT;
  if (isNote(item.event)) {
    if (item.stemDown) bottom = Math.max(bottom, item.stemEnd);
    else top = Math.min(top, item.stemEnd);
  }
  if (item.event.articulation) {
    const mark = articulationPlace(item, staffTopY);
    if (mark.below) bottom = Math.max(bottom, mark.y + ARTICULATION_HALF_HEIGHT);
    else top = Math.min(top, mark.y - ARTICULATION_HALF_HEIGHT);
  }
  return { top, bottom };
}

/**
 * Staff tops that keep each staff clear of the one above, from a system laid out at `tops`: a staff
 * moves down (with the ones below it) until its highest ink is clear of the lowest ink above it.
 */
export function spacedTops(system: System, plan: StaffPlan[], tops: number[]): number[] {
  const ink = tops.map((top) => ({ top, bottom: top + STAFF_HEIGHT }));
  for (const item of system.events.filter((e) => !e.hidden)) {
    const { top, bottom } = eventInk(item, tops[staffOf(item)]);
    const staff = ink[staffOf(item)];
    staff.top = Math.min(staff.top, top);
    staff.bottom = Math.max(staff.bottom, bottom);
  }
  for (const label of system.labels.filter((l) => l.kind === "dynamic")) {
    const staff = ink[label.staff ?? 0];
    staff.bottom = Math.max(staff.bottom, label.y);
  }
  const spaced = [tops[0]];
  for (let i = 1; i < tops.length; i++) {
    const moved = spaced[i - 1] - tops[i - 1];
    const base = spaced[i - 1] + (plan[i].partFirst ? STAFF_DISTANCE.betweenParts : STAFF_DISTANCE.inPart);
    const clear = ink[i - 1].bottom + moved + MIN_STAFF_CLEARANCE + (tops[i] - ink[i].top);
    spaced.push(Math.max(base, clear));
  }
  return spaced;
}

/** What the system draws for each staff: clef, key, and on a part's first staff its barline reach, brace and name. */
export function staffScenes(plan: StaffPlan[], tops: number[], indent: number, firstLine: boolean): StaffScene[] {
  return plan.map((staff, i) => {
    const scene: StaffScene = {
      staffId: staff.staffId,
      top: tops[i],
      clef: staff.clef,
      keySignature: keySignatureMarks(staff.key, tops[i], staff.clef, indent),
    };
    if (!staff.partFirst) return scene;
    const lastTop = tops[i + staff.partStaves - 1];
    scene.barlineEnd = lastTop + STAFF_HEIGHT;
    if (staff.partStaves > 1) scene.brace = true;
    if (indent > 0) {
      const middle = (tops[i] + lastTop + STAFF_HEIGHT) / 2;
      scene.name = { text: firstLine ? staff.name : staff.abbreviation, y: middle + NAME_BASELINE };
    }
    return scene;
  });
}

/** Where a system's staves start. */
export const stavesLeft = (system: Pick<System, "indent">) => STAFF_LEFT + (system.indent ?? 0);

/** Right edge of the part names, left of the staves. */
export const nameRight = (system: Pick<System, "indent">) => stavesLeft(system) - NAME_GAP;
