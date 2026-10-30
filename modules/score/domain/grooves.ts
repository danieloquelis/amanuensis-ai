import { sortDrums, type DrumPiece } from "./drums";
import { beatGroupLength, measureCapacity, meterName } from "./rhythm";
import { spellRhythm } from "./rhythm-spelling";
import type { Meter } from "./schema";

/**
 * Drum grooves: a bar's hands (voice 1) and feet (voice 2), written as one token per step: "-"
 * for nothing, piece letters joined by "+" for hits together. A hit lasts until the next one
 * within its beat (a drummer reads the rest as silence), and every value is spelled at its place.
 */
type Pattern = { step: number; hands: string; feet: string };

const LETTERS: Record<string, DrumPiece> = {
  k: "kick",
  s: "snare",
  x: "stick",
  h: "hat",
  o: "hatopen",
  f: "hatfoot",
  r: "ride",
  c: "crash",
  t1: "tom1",
  t2: "tom2",
  t3: "tom3",
};

export const GROOVES = {
  rock: { "4/4": { step: 0.5, hands: "h h h+s h h h h+s h", feet: "k - - - k - - -" } },
  rock16: {
    "4/4": { step: 0.25, hands: "h h h h h+s h h h h h h h h+s h h h", feet: "k - - - - - - - k - k - - - - -" },
  },
  halftime: { "4/4": { step: 0.5, hands: "h h h h h+s h h h", feet: "k - - - - - k -" } },
  funk: {
    "4/4": { step: 0.25, hands: "h - h - h+s - h - h - h - h+s - h s", feet: "k - - k - - - - - - k - - - - -" },
  },
  disco: { "4/4": { step: 0.5, hands: "h o h+s o h o h+s o", feet: "k - k - k - k -" } },
  bossa: { "4/4": { step: 0.5, hands: "h+x h h h+x h h h+x h", feet: "k - f k k - f k" } },
  waltz: { "3/4": { step: 1, hands: "h h+s h+s", feet: "k - -" } },
  ballad68: { "6/8": { step: 0.5, hands: "h h h h+s h h", feet: "k - - - - k" } },
} satisfies Record<string, Record<string, Pattern>>;

export type GrooveName = keyof typeof GROOVES;
export const GROOVE_NAMES = Object.keys(GROOVES) as GrooveName[];

/** One written value of a drum line: the pieces struck, or null for a rest. */
export type DrumValue = { drums: DrumPiece[] | null; beats: number };

const EPSILON = 1e-9;
/** A fill runs down the kit in eighths: snare, then the toms from high to low. */
const FILL_PIECES: DrumPiece[] = ["snare", "tom1", "tom2", "tom3"];
const FILL_STEP = 0.5;

/** The grooves written for a meter. */
export const groovesFor = (meter: Meter): GrooveName[] =>
  GROOVE_NAMES.filter((name) => meterName(meter) in GROOVES[name]);

function patternFor(groove: GrooveName, meter: Meter): Pattern {
  const pattern = (GROOVES[groove] as Record<string, Pattern>)[meterName(meter)];
  if (pattern) return pattern;
  const fitting = groovesFor(meter);
  const others = fitting.length
    ? `In ${meterName(meter)}: ${fitting.join(", ")}.`
    : `No groove is written for ${meterName(meter)} yet.`;
  throw new Error(`The ${groove} groove is for ${Object.keys(GROOVES[groove]).join(", ")}. ${others}`);
}

const slotsOf = (line: string): (DrumPiece[] | null)[] =>
  line.split(" ").map((token) => (token === "-" ? null : token.split("+").map((letter) => LETTERS[letter])));

/** Steps as written values: a hit holds to the next hit within its beat, silence between is rests. */
function written(slots: (DrumPiece[] | null)[], step: number, meter: Meter): DrumValue[] {
  const group = beatGroupLength(meter);
  const values: { drums: DrumPiece[] | null; at: number; beats: number }[] = [];
  for (let i = 0; i < slots.length;) {
    const at = i * step;
    const beatEnd = (Math.floor(at / group + EPSILON) + 1) * group;
    let next = i + 1;
    while (next < slots.length && !slots[next] && (slots[i] ? next * step < beatEnd - EPSILON : true)) next++;
    values.push({ drums: slots[i] && sortDrums(slots[i]!), at, beats: (next - i) * step });
    i = next;
  }
  // A hit split by the spelling keeps only its first part: the rest of its time is silence.
  return values.flatMap(({ drums, at, beats }) =>
    spellRhythm(at, beats, meter, !drums).map((part, k) => ({ drums: k === 0 ? drums : null, beats: part })),
  );
}

/**
 * One bar of a groove in its meter, hands and feet. With `fill`, the second half of the bar (the
 * last beat of a short bar) is a fill down the kit instead of the groove's hands.
 */
export function grooveBar(groove: GrooveName, meter: Meter, fill = false): { hands: DrumValue[]; feet: DrumValue[] } {
  const pattern = patternFor(groove, meter);
  const capacity = measureCapacity(meter);
  // A fill moves in eighths: a groove in quarters is first written out on an eighth grid.
  const step = fill ? Math.min(pattern.step, FILL_STEP) : pattern.step;
  const per = Math.round(pattern.step / step);
  let handSlots = slotsOf(pattern.hands).flatMap((slot) => [slot, ...Array<null>(per - 1).fill(null)]);
  if (fill) {
    const fillStart = capacity - (capacity >= 4 ? capacity / 2 : beatGroupLength(meter));
    const fillHits = Math.round((capacity - fillStart) / FILL_STEP);
    handSlots = handSlots.map((slot, i) => {
      const at = i * step;
      if (at < fillStart - EPSILON) return slot;
      const k = (at - fillStart) / FILL_STEP;
      if (Math.abs(k - Math.round(k)) > EPSILON) return null;
      return [FILL_PIECES[Math.floor((Math.round(k) * FILL_PIECES.length) / fillHits)]];
    });
  }
  return { hands: written(handSlots, step, meter), feet: written(slotsOf(pattern.feet), pattern.step, meter) };
}
