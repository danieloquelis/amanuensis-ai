import { beatGroupLength, durationNotation } from "@/modules/score";
import { STEM_LENGTH, stemX, type BarScene, type EngravedEvent, type System } from "./scene";

const SECONDARY_BEAM_GAP = 7;
const BEAM_STUB_LENGTH = 10;
/** Groups whose average notehead sits at or above this distance from the top line take down-stems. */
const STEM_DOWN_THRESHOLD = 24;

const isSixteenth = (item: EngravedEvent | undefined) =>
  item !== undefined && durationNotation(item.event.duration).base === 0.25;

/** Beams consecutive eighths and sixteenths within each beat group of a bar. */
export function beamBar(system: System, bar: BarScene) {
  const groupLength = beatGroupLength(bar.meter);
  const events = system.events.filter((e) => e.measure === bar.number - 1);
  let group: EngravedEvent[] = [];
  const flush = () => {
    if (group.length >= 2) beamGroup(system, group);
    group = [];
  };
  for (const item of events) {
    const beamable = item.event.pitch && durationNotation(item.event.duration).base <= 0.5;
    if (!beamable) {
      flush();
      continue;
    }
    const groupIndex = (beat: number) => Math.floor(beat / groupLength);
    if (group.length && groupIndex(item.localBeat) !== groupIndex(group[0].localBeat)) flush();
    group.push(item);
  }
  flush();
}

/** Sets a shared stem direction and end for the group, then adds primary and sixteenth beams. */
function beamGroup(system: System, group: EngravedEvent[]) {
  const averageY = group.reduce((sum, e) => sum + e.y, 0) / group.length;
  const down = averageY <= system.top + STEM_DOWN_THRESHOLD;
  const end = down
    ? Math.max(...group.map((e) => e.y)) + STEM_LENGTH
    : Math.min(...group.map((e) => e.y)) - STEM_LENGTH;
  for (const item of group) {
    item.stemDown = down;
    item.stemEnd = end;
    system.beamedIds.push(item.event.id);
  }
  system.beams.push({ x1: stemX(group[0]), x2: stemX(group.at(-1)!), y: end, level: 1 });

  const secondaryY = end + (down ? -SECONDARY_BEAM_GAP : SECONDARY_BEAM_GAP);
  group.forEach((item, index) => {
    if (!isSixteenth(item)) return;
    const next = group[index + 1];
    const previous = group[index - 1];
    if (isSixteenth(next)) {
      system.beams.push({ x1: stemX(item), x2: stemX(next), y: secondaryY, level: 2 });
    } else if (!isSixteenth(previous)) {
      // A lone sixteenth gets a stub pointing toward its neighbour.
      const stub = next ? BEAM_STUB_LENGTH : -BEAM_STUB_LENGTH;
      system.beams.push({ x1: stemX(item), x2: stemX(item) + stub, y: secondaryY, level: 2 });
    }
  });
}
