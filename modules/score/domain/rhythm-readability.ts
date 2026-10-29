import { metricWeight } from "./rhythm-spelling";
import type { Meter } from "./schema";

const EIGHTH = 0.5;
const EPSILON = 1e-9;
/** metricWeight of a sixteenth point: a note starting there is a sixteenth-note syncopation. */
const SIXTEENTH_WEIGHT = 0;

/** One written value of a passage, in quarter-note beats. */
type Written = { duration: number; pitch: unknown; tie?: boolean };

/**
 * How plainly a written passage reads, counted over its notes: values shorter than an eighth,
 * ties inside a bar (syncopations the spelling had to show), and notes starting on a sixteenth.
 */
export type Readability = { notes: number; sixteenths: number; tiesInBar: number; onSixteenths: number };

export function readability(bars: Written[][], meter: Meter): Readability {
  const counts: Readability = { notes: 0, sixteenths: 0, tiesInBar: 0, onSixteenths: 0 };
  for (const bar of bars) {
    let at = 0;
    bar.forEach((event, i) => {
      if (event.pitch !== null) {
        counts.notes++;
        if (event.duration < EIGHTH - EPSILON) counts.sixteenths++;
        if (event.tie && i < bar.length - 1) counts.tiesInBar++;
        if (metricWeight(at, meter) <= SIXTEENTH_WEIGHT) counts.onSixteenths++;
      }
      at += event.duration;
    });
  }
  return counts;
}

/** "14 notes, 3 sixteenths, 2 ties inside bars", or "14 notes, all eighths or longer, no ties inside bars". */
export function describeReadability({ notes, sixteenths, tiesInBar, onSixteenths }: Readability): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    sixteenths ? count(sixteenths, "sixteenth", "sixteenths") : "all eighths or longer",
    tiesInBar ? count(tiesInBar, "tie inside a bar", "ties inside bars") : "no ties inside bars",
    ...(onSixteenths ? [`${onSixteenths} starting on a sixteenth`] : []),
  ];
  return `${count(notes, "note", "notes")}, ${parts.join(", ")}`;
}
