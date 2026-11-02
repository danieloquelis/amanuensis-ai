import {
  everyEvent,
  INSTRUMENT_IDS,
  isRest,
  keyName,
  meterName,
  METERS,
  scoreKey,
  staffHandle,
  SCORE_LIMITS,
  TEMPO_RANGE,
  transpositionOf,
  writtenKey,
  type BasicOperation,
  type KeySignature,
  type Meter,
  type Score,
} from "@/modules/score";
import type { z } from "zod";
import type { readSourceSchema } from "./source-tool-schemas";

type Reading = z.infer<typeof readSourceSchema>;
type InstrumentId = (typeof INSTRUMENT_IDS)[number];

/** Words that name each instrument we have, or the nearest we have to it (an oboe plays as a flute). */
const SOUNDS_LIKE: [RegExp, InstrumentId][] = [
  [/drum|kit|percussion/i, "drums"],
  [/trumpet|cornet|flugel/i, "trumpet"],
  // The strings before "bass" and "alto": a double bass is not a bass guitar, a viola reads the alto clef.
  [/cello|violoncell/i, "cello"],
  [/viola|\bvla\b/i, "viola"],
  [/violin|fiddle|\bvln\b/i, "violin"],
  [/contrabass|double ?bass|upright|string bass|contrabajo/i, "doublebass"],
  // Before "guitar": a bass guitar is a bass. "Bass" alone never means the bass drum here (drums come first).
  [/\bbass\b|bajo/i, "bass"],
  [/trombone|tuba|euphonium|baritone/i, "trombone"],
  [/guitar|ukulele|banjo/i, "guitar"],
  [/flute|piccolo|recorder|voice|vocal|soprano|alto|tenor|sax|clarinet|oboe|melody|lead/i, "flute"],
  [/piano|keys|keyboard|organ|synth/i, "piano"],
];

const instrumentFor = (part: Reading["parts"][number]): InstrumentId | null =>
  SOUNDS_LIKE.find(([words]) => words.test(`${part.instrument} ${part.name}`))?.[1] ?? null;

/** A meter as the reading names it: "6/8", "C" (4/4), "cut time" or "₵" (2/2); null when not one we hold. */
function meterOf(name: string | undefined): Meter | null {
  if (!name) return null;
  if (/cut|₵|alla breve/i.test(name)) return { numerator: 2, denominator: 2 };
  if (/^\s*(c|common)\b/i.test(name)) return { numerator: 4, denominator: 4 };
  const match = /(\d+)\s*\/\s*(\d+)/.exec(name);
  if (!match || !(METERS as readonly string[]).includes(`${match[1]}/${match[2]}`)) return null;
  return { numerator: Number(match[1]), denominator: Number(match[2]) } as Meter;
}

/**
 * The concert key from the key signature on the page: a page of transposing parts only (a B♭
 * trumpet part) shows their written key, so 2 flats there is A♭ major (4 flats) at concert pitch.
 */
function concertKey(reading: Reading, instruments: InstrumentId[]): KeySignature {
  const mode = /minor/i.test(reading.key ?? "") ? "minor" : "major";
  const shown: KeySignature = { fifths: reading.keySignature, mode };
  const transpositions = instruments.map(transpositionOf);
  const first = transpositions[0];
  if (!first || transpositions.some((t) => !t || t.semitones !== first.semitones)) return shown;
  for (let fifths = -7; fifths <= 7; fifths++) {
    if (writtenKey({ fifths, mode }, first).fifths === reading.keySignature) return { fifths, mode };
  }
  return shown;
}

/** Whether the score has no music yet: only rests and no chord symbols. */
export const isEmptyScore = (score: Score) => everyEvent(score).every(isRest) && !score.chords.length;

/**
 * The score a reading describes, as one newScore: its instruments (the nearest we have), key at
 * concert pitch, meter, tempo and bars (as many as fit). `notes` says what was approximated.
 */
export function setupFromReading(reading: Reading): { operation: BasicOperation; notes: string[] } {
  const parts = reading.parts.slice(0, SCORE_LIMITS.parts);
  const instruments = parts.map((part) => instrumentFor(part) ?? "piano");
  const notes = parts.flatMap((part, k) =>
    instrumentFor(part) ? [] : [`${part.name} plays on ${instruments[k]}: there is no closer sound yet.`],
  );
  const meter = meterOf(reading.meter);
  if (reading.meter && !meter) notes.push(`${reading.meter} is not a meter the score holds: it is in 4/4.`);
  const tempo = reading.quarterBpm && Math.min(TEMPO_RANGE.max, Math.max(TEMPO_RANGE.min, reading.quarterBpm));
  const operation: BasicOperation = {
    type: "newScore",
    ...(reading.title ? { title: reading.title.slice(0, 100) } : {}),
    ...(meter ? { meter } : {}),
    ...(tempo ? { tempo } : {}),
    bars: Math.min(reading.bars, SCORE_LIMITS.measures),
    key: concertKey(reading, instruments),
    instruments,
  };
  return { operation, notes };
}

/** Reads and changes the turn's score, as the music tools do. */
export type ScoreWriter = { get: () => Score; commit: (operation: BasicOperation) => { ok: boolean } };

/**
 * Sets up an empty score from the reading, a grand staff where a part has two staves, and says
 * what it is and which staves to write into. A score with music is left as it is: where the new
 * music goes is the musician's call.
 */
export function setUpScore(reading: Reading, writer: ScoreWriter): string {
  if (!isEmptyScore(writer.get())) {
    return "The score already has music: ask whether this replaces it, goes after the last bar, or comes in as new parts; then set it up.";
  }
  const { operation, notes } = setupFromReading(reading);
  if (!writer.commit(operation).ok)
    return "Set up the score yourself (one newScore): the setup from your reading was refused.";
  const parts = reading.parts.slice(0, SCORE_LIMITS.parts);
  writer.get().parts.forEach((part, k) => {
    if (parts[k]?.staves === 2) writer.commit({ type: "setStaffCount", partId: part.id, staves: 2 });
  });
  const score = writer.get();
  const staves = score.parts.flatMap((part) => part.staves.map((staff) => staffHandle(score, staff.id)));
  const shape = `${keyName(scoreKey(score))}, ${meterName(score.measures[0].meter)}, tempo ${score.tempo}, ${score.measures.length} bars`;
  return `Set up the score (${shape}); write into ${staves.join(", ")}. Don't set it up again. ${notes.join(" ")}`.trim();
}
