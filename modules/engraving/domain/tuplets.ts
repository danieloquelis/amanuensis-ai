import { isNote } from "@/modules/score";
import type { AnalyzedBar } from "./measure-analysis";
import { STAFF_HEIGHT, TUPLET_HALF_HEIGHT, type EngravedEvent, type TupletMark } from "./scene";
import { eventInk, staffOf } from "./staff-layout";
import { NOTEHEAD_WIDTH } from "./voice-layout";

/** Space between the members' ink and the bracket or number. */
const INK_GAP = 7;
/** A bracketed number stays at least this far outside the staff lines. */
const STAFF_GAP = 6;

/**
 * The "3" of each triplet in a placed bar, after its beams (so stem tips are final). It goes on
 * the stem side (above for a group of rests, by voice when voices share the staff), past every
 * member's ink and outside the staff. A group beamed exactly on its own shows the number alone;
 * any other group gets a bracket from its first to its last head.
 */
export function placeTuplets(bar: AnalyzedBar, events: EngravedEvent[], tops: number[]): TupletMark[] {
  const groups = new Map<string, number[]>();
  events.forEach((item, index) => {
    const id = item.event.tuplet?.id;
    if (id && !item.hidden) groups.set(id, [...(groups.get(id) ?? []), index]);
  });
  return [...groups].map(([id, indexes]) => {
    const members = indexes.map((index) => events[index]);
    const staff = staffOf(members[0]);
    const top = tops[staff];
    const firstNote = members.find((item) => isNote(item.event));
    const side = members[0].curveSide;
    const above = side ? side === "above" : !firstNote || !firstNote.stemDown;
    const inks = members.map((item) => eventInk(item, top));
    const y = above
      ? Math.min(top - STAFF_GAP, ...inks.map((ink) => ink.top - INK_GAP)) - TUPLET_HALF_HEIGHT
      : Math.max(top + STAFF_HEIGHT + STAFF_GAP, ...inks.map((ink) => ink.bottom + INK_GAP)) + TUPLET_HALF_HEIGHT;
    const beamedAlone = bar.beamGroups.some(
      (group) => group.length === indexes.length && group.every((index) => indexes.includes(index)),
    );
    return {
      id,
      x1: members[0].x - NOTEHEAD_WIDTH / 2,
      x2: members.at(-1)!.x + NOTEHEAD_WIDTH / 2,
      y,
      above,
      bracket: !beamedAlone,
      ...(staff ? { staff } : {}),
    };
  });
}
