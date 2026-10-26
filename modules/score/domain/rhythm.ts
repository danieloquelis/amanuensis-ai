import type { Meter } from "./schema";

/** Musical time in quarter-note beats: an eighth is 1/2, a 6/8 bar holds 3. */
export type Fraction = { numerator: number; denominator: number };

export const METERS = ["2/4", "3/4", "4/4", "5/4", "3/8", "6/8", "9/8", "12/8"] as const;

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

/** Compound meters (6/8, 9/8, 12/8) group in dotted quarters; everything else in quarters. */
export function beatGroupLength(meter: Meter): number {
  return meter.denominator === 8 && meter.numerator % 3 === 0 ? 1.5 : 1;
}
