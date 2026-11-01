import type { Meter, ScoreEvent } from "./schema";

/** Musical time in quarter-note beats: an eighth is 1/2, a 6/8 bar holds 3. */
export type Fraction = { numerator: number; denominator: number };

/** Simple meters, cut time (2/2) among them, then compound meters. */
export const METERS = ["2/2", "2/4", "3/4", "4/4", "5/4", "6/4", "3/8", "6/8", "9/8", "12/8"] as const;

export const DURATIONS = [
  { label: "Dotted whole", value: 6 },
  { label: "Whole", value: 4 },
  { label: "Dotted half", value: 3 },
  { label: "Half", value: 2 },
  { label: "Dotted quarter", value: 1.5 },
  { label: "Quarter", value: 1 },
  { label: "Dotted eighth", value: 0.75 },
  { label: "Eighth", value: 0.5 },
  { label: "Dotted sixteenth", value: 0.375 },
  { label: "Sixteenth", value: 0.25 },
] as const;

const DOTTED_VALUES = [6, 3, 1.5, 0.75, 0.375];

export function fraction(numerator: number, denominator = 1): Fraction {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Invalid musical duration.");
  }
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

export const beats = (value: Fraction) => value.numerator / value.denominator;

/** What timing needs of an event: its written value, and its triplet mark if it has one. */
type Timed = Pick<ScoreEvent, "duration"> & { tuplet?: ScoreEvent["tuplet"] };

/**
 * How long an event sounds, as an exact fraction of quarter-note beats. `event.duration` is the
 * written value, which decides how the note looks; time arithmetic (onsets, bar totals, playback)
 * uses this instead: a triplet member sounds two thirds of its written value.
 */
export function soundingDuration(event: Timed): Fraction {
  const { duration, tuplet } = event;
  return tuplet ? fraction(duration.numerator * tuplet.normal, duration.denominator * tuplet.actual) : duration;
}

/** How long an event sounds, in quarter-note beats. */
export const soundingBeats = (event: Timed) => beats(soundingDuration(event));

/** Where each event starts in its bar, in beats from 0, summed exactly so positions never drift. */
export function eventOnsets(events: readonly Timed[]): number[] {
  let at = fraction(0);
  return events.map((event) => {
    const onset = beats(at);
    at = add(at, soundingDuration(event));
    return onset;
  });
}

/** Converts a supported written value (multiple of 1/8 beat) into an exact fraction. */
export const durationFromBeats = (value: number) => fraction(value * 8, 8);

export const isSupportedDuration = (value: number) => DURATIONS.some((d) => d.value === value);

/** Splits a duration into its undotted written value and whether it carries a dot. */
export function durationNotation(duration: Fraction) {
  const value = beats(duration);
  const dotted = DOTTED_VALUES.includes(value);
  return { base: dotted ? value / 1.5 : value, dotted };
}

export const meterName = (meter: Meter) => `${meter.numerator}/${meter.denominator}`;

/** Bar length in quarter-note beats. */
export const measureCapacity = (meter: Meter) => (meter.numerator * 4) / meter.denominator;

/**
 * The tempo as a musician marks it: per half note in cut time (quarter = 200 is half = 100), per
 * quarter otherwise. A score's tempo is always kept in quarter notes.
 */
export function tempoMarking(tempo: number, meter: Meter): { note: "quarter" | "half"; perMinute: number } {
  return meter.denominator === 2
    ? { note: "half", perMinute: Math.round(tempo / 2) }
    : { note: "quarter", perMinute: tempo };
}

/** Compound meters (6/8, 9/8, 12/8): their beat is a dotted quarter, three eighths. */
export const isCompound = (meter: Meter) => meter.denominator === 8 && meter.numerator % 3 === 0;

/**
 * The beat, in quarter-note beats: a dotted quarter in compound meters, a half in cut time (2/2,
 * felt in two), otherwise a quarter. Beams, rests, slashes and rhythm spelling follow it.
 */
export function beatGroupLength(meter: Meter): number {
  if (isCompound(meter)) return 1.5;
  return meter.denominator === 2 ? 2 : 1;
}

/** 6/4: six quarter beats, felt as two groups of three (two dotted halves). */
const isSixFour = (meter: Meter) => meter.numerator === 6 && meter.denominator === 4;

/**
 * Where the bar divides into two strong halves, in quarter-note beats: the middle of a bar of
 * four beats (4/4, 12/8) or of 6/4. Rests never cross it. Null when the bar has no such middle.
 */
export function barMiddle(meter: Meter): number | null {
  const capacity = measureCapacity(meter);
  const beatsInBar = Math.round(capacity / beatGroupLength(meter));
  return beatsInBar === 4 || isSixFour(meter) ? capacity / 2 : null;
}

/** Rest values a meter may use, longest first: 6/4 rests a half bar as a dotted half. */
export function restValues(meter: Meter): number[] {
  if (isCompound(meter)) return [3, 1.5, 0.5, 0.25];
  return isSixFour(meter) ? [3, 2, 1, 0.5, 0.25] : [4, 2, 1, 0.5, 0.25];
}
