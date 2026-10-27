import { TEMPO_RANGE } from "./schema";

export type TempoMarking = { name: string; min: number; max: number };

/**
 * Conventional tempo markings and their usual quarter-note ranges (they overlap, as in practice),
 * clamped to the tempi a score can hold. Ordered slow to fast.
 */
export const TEMPO_MARKINGS: readonly TempoMarking[] = [
  { name: "Grave", min: TEMPO_RANGE.min, max: 45 },
  { name: "Largo", min: TEMPO_RANGE.min, max: 60 },
  { name: "Lento", min: 45, max: 60 },
  { name: "Larghetto", min: 60, max: 66 },
  { name: "Adagio", min: 66, max: 76 },
  { name: "Andante", min: 76, max: 108 },
  { name: "Andantino", min: 80, max: 108 },
  { name: "Moderato", min: 108, max: 120 },
  { name: "Allegretto", min: 112, max: 120 },
  { name: "Allegro", min: 120, max: 156 },
  { name: "Vivace", min: 156, max: 176 },
  { name: "Presto", min: 168, max: TEMPO_RANGE.max },
];

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The marking named in `text` ("Allegro", "andante", "un poco allegretto"), longest name first. */
export function findTempoMarking(text: string): TempoMarking | null {
  const words = plain(text);
  const named = TEMPO_MARKINGS.filter((m) => new RegExp(`\\b${plain(m.name)}\\b`).test(words));
  return named.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

/** The usual tempo for a marking: the middle of its range. */
export const typicalTempo = (marking: TempoMarking) => Math.round((marking.min + marking.max) / 2);

/** The narrowest marking whose range holds `bpm`, to describe a tempo the way musicians do. */
export function tempoMarkingFor(bpm: number): TempoMarking {
  const holding = TEMPO_MARKINGS.filter((m) => bpm >= m.min && bpm <= m.max);
  if (!holding.length) return bpm < TEMPO_MARKINGS[0].min ? TEMPO_MARKINGS[0] : TEMPO_MARKINGS.at(-1)!;
  return holding.sort((a, b) => a.max - a.min - (b.max - b.min))[0];
}
