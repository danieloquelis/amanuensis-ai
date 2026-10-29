import { barStyle, JUMP_MARKS, type MarkKind, type Score } from "@/modules/score";

/** Safety bound: a malformed form can never loop forever. */
const MAX_PERFORMED_BARS = 4096;

/**
 * The order bars are played in, following repeats and any number of navigation marks:
 * - a repeat range plays `count` times, but only before the first D.C./D.S. jump (convention);
 * - each D.C./D.S. mark is taken once: D.C. to the first bar, D.S. to the nearest segno before it;
 * - after an "al Coda" jump, To Coda leaves for the next coda; after other jumps, Fine stops.
 * Jumps whose target is missing are ignored.
 */
export function performanceOrder(score: Score): number[] {
  const { measures } = score;
  const marksAt = (index: number) => score.marks.filter((m) => m.measureId === measures[index].id);
  const barsWith = (kind: MarkKind) =>
    measures.flatMap((measure, index) =>
      score.marks.some((m) => m.measureId === measure.id && m.kind === kind) ? [index] : [],
    );
  const segnos = barsWith("segno");
  const codas = barsWith("coda");
  const passes = new Map<string, number>();
  const taken = new Set<string>();
  const order: number[] = [];
  let jump: MarkKind | null = null;
  let index = 0;
  while (index < measures.length && order.length < MAX_PERFORMED_BARS) {
    order.push(index);
    const measure = measures[index];
    const marks = marksAt(index);
    const repeat = jump ? undefined : score.repeats.find((r) => r.endMeasureId === measure.id);
    if (repeat) {
      const played = passes.get(repeat.id) ?? 1;
      if (played < repeat.count) {
        passes.set(repeat.id, played + 1);
        index = measures.findIndex((m) => m.id === repeat.startMeasureId);
        continue;
      }
    }
    const has = (kind: MarkKind) => marks.some((m) => m.kind === kind);
    if (jump && !jump.endsWith("AlCoda") && has("fine")) break;
    if (jump?.endsWith("AlCoda") && has("toCoda")) {
      const coda = codas.find((bar) => bar > index) ?? codas[0];
      if (coda !== undefined) {
        index = coda;
        continue;
      }
    }
    const nextJump = marks.find((m) => JUMP_MARKS.includes(m.kind as never) && !taken.has(m.id));
    if (nextJump) {
      const segno = [...segnos].reverse().find((bar) => bar <= index) ?? segnos[0];
      const target = nextJump.kind.startsWith("dc") ? 0 : segno;
      if (target !== undefined) {
        taken.add(nextJump.id);
        jump = nextJump.kind;
        index = target;
        continue;
      }
    }
    index++;
  }
  return order;
}

/** For a repeat (%) bar, the written bar whose music it plays; otherwise the bar itself. */
export function soundingSource(score: Score, index: number): number {
  let source = index;
  while (source > 0 && barStyle(score.measures[source]) === "repeat") source--;
  return source;
}
