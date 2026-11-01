import { metricWeight } from "./rhythm-spelling";
import type { Meter } from "./schema";

const EIGHTH = 0.5;
const EPSILON = 1e-9;
/** metricWeight of a sixteenth point: a note starting there is a sixteenth-note syncopation. */
const SIXTEENTH_WEIGHT = 0;

/** One written value of a passage, in quarter-note beats; a triplet member sounds two thirds of it. */
type Written = { duration: number; pitch: unknown; tie?: boolean; tuplet?: number | null };

/**
 * How plainly a written passage reads, counted over its notes: values shorter than an eighth,
 * ties inside a bar (syncopations the spelling had to show), notes starting on a sixteenth, and
 * notes in triplets (which fall between the sixteenth grid's points, so are counted on their own).
 */
export type Readability = {
  notes: number;
  sixteenths: number;
  tiesInBar: number;
  onSixteenths: number;
  triplets: number;
};

export function readability(bars: Written[][], meter: Meter): Readability {
  const counts: Readability = { notes: 0, sixteenths: 0, tiesInBar: 0, onSixteenths: 0, triplets: 0 };
  for (const bar of bars) {
    let at = 0;
    bar.forEach((event, i) => {
      const triplet = event.tuplet !== undefined && event.tuplet !== null;
      if (event.pitch !== null) {
        counts.notes++;
        if (triplet) counts.triplets++;
        else if (event.duration < EIGHTH - EPSILON) counts.sixteenths++;
        if (event.tie && i < bar.length - 1) counts.tiesInBar++;
        if (!triplet && metricWeight(at, meter) <= SIXTEENTH_WEIGHT) counts.onSixteenths++;
      }
      at += triplet ? (event.duration * 2) / 3 : event.duration;
    });
  }
  return counts;
}

/** "14 notes, 3 sixteenths, 2 ties inside bars", or "14 notes, all eighths or longer, no ties inside bars". */
export function describeReadability({ notes, sixteenths, tiesInBar, onSixteenths, triplets }: Readability): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    sixteenths ? count(sixteenths, "sixteenth", "sixteenths") : "all eighths or longer",
    tiesInBar ? count(tiesInBar, "tie inside a bar", "ties inside bars") : "no ties inside bars",
    ...(onSixteenths ? [`${onSixteenths} starting on a sixteenth`] : []),
    ...(triplets ? [`${triplets} in triplets`] : []),
  ];
  return `${count(notes, "note", "notes")}, ${parts.join(", ")}`;
}
