import type { Clef, Part } from "./schema";

/** The instruments a part can be played on. Drums come later, with the percussion staff. */
export const INSTRUMENT_IDS = ["piano", "guitar", "trumpet", "flute", "trombone"] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

/** How a transposing instrument's music is written: `steps` staff steps and `semitones` above the sound. */
export type Transposition = { steps: number; semitones: number };

export type Instrument = {
  name: string;
  abbreviation: string;
  clef: Clef;
  /** Written = sounding + this. Absent for instruments written as they sound. */
  transposition?: Transposition;
  /** Concert (sounding) MIDI notes the instrument plays comfortably; notes outside are flagged, not refused. */
  range: { low: number; high: number };
};

/** Pitches are stored as they sound (concert pitch); a transposing part is only shown transposed. */
export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  piano: { name: "Piano", abbreviation: "Pno.", clef: "treble", range: { low: 21, high: 108 } },
  // Guitar music is written an octave above its sound, on a treble clef with an 8 below.
  guitar: {
    name: "Guitar",
    abbreviation: "Gtr.",
    clef: "treble8vb",
    transposition: { steps: 7, semitones: 12 },
    range: { low: 40, high: 88 },
  },
  trumpet: {
    name: "Trumpet in B♭",
    abbreviation: "Tpt.",
    clef: "treble",
    transposition: { steps: 1, semitones: 2 },
    range: { low: 52, high: 82 },
  },
  flute: { name: "Flute", abbreviation: "Fl.", clef: "treble", range: { low: 60, high: 96 } },
  trombone: { name: "Trombone", abbreviation: "Tbn.", clef: "bass", range: { low: 40, high: 77 } },
};

/** Whether a sounding pitch is inside the instrument's comfortable range. */
export function isPlayable(midi: number, instrument: InstrumentId): boolean {
  const { low, high } = INSTRUMENTS[instrument].range;
  return midi >= low && midi <= high;
}

/** A one-staff part in the instrument's clef, with one voice, the given IDs and the instrument's name. */
export function createPart(instrument: InstrumentId, ids: { part: string; staff: string; voice: string }): Part {
  return {
    id: ids.part,
    instrument,
    name: INSTRUMENTS[instrument].name,
    staves: [{ id: ids.staff, clef: INSTRUMENTS[instrument].clef, voices: [{ id: ids.voice }] }],
  };
}
