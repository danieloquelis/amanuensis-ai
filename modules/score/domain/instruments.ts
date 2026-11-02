import type { Clef, Part } from "./schema";

/** The instruments a part can be played on. */
export const INSTRUMENT_IDS = [
  "piano",
  "guitar",
  "bass",
  "trumpet",
  "flute",
  "trombone",
  "violin",
  "viola",
  "cello",
  "doublebass",
  "drums",
] as const;

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
  // Bass guitar, like every bass part, is written an octave above its sound, on a plain bass clef.
  bass: {
    name: "Bass",
    abbreviation: "Bass",
    clef: "bass",
    transposition: { steps: 7, semitones: 12 },
    range: { low: 28, high: 67 },
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
  violin: { name: "Violin", abbreviation: "Vln.", clef: "treble", range: { low: 55, high: 100 } },
  // The viola reads the alto clef: middle C on the middle line.
  viola: { name: "Viola", abbreviation: "Vla.", clef: "alto", range: { low: 48, high: 88 } },
  cello: { name: "Violoncello", abbreviation: "Vc.", clef: "bass", range: { low: 36, high: 81 } },
  // Like the bass guitar, the double bass is written an octave above its sound.
  doublebass: {
    name: "Double Bass",
    abbreviation: "Db.",
    clef: "bass",
    transposition: { steps: 7, semitones: 12 },
    range: { low: 28, high: 67 },
  },
  // A drum kit has no pitches: its hits name kit pieces (see drums.ts).
  drums: { name: "Drums", abbreviation: "Dr.", clef: "percussion", range: { low: 0, high: 127 } },
};

/** Whether an instrument plays drum hits rather than pitches. */
export const isDrumKit = (instrument: InstrumentId) => instrument === "drums";

/** Whether a sounding pitch is inside the instrument's comfortable range. */
export function isPlayable(midi: number, instrument: InstrumentId): boolean {
  const { low, high } = INSTRUMENTS[instrument].range;
  return midi >= low && midi <= high;
}

/**
 * A one-staff part in the instrument's clef, with the given IDs and the instrument's name: one
 * voice, or for drums two (hands, then feet).
 */
export function createPart(instrument: InstrumentId, ids: { part: string; staff: string; voice: string }): Part {
  const voices = isDrumKit(instrument) ? [{ id: ids.voice }, { id: `${ids.voice}-feet` }] : [{ id: ids.voice }];
  return {
    id: ids.part,
    instrument,
    name: INSTRUMENTS[instrument].name,
    staves: [{ id: ids.staff, clef: INSTRUMENTS[instrument].clef, voices }],
  };
}

/**
 * Each instrument's General MIDI program (0-based), for files other tools read; the drums play on
 * the percussion channel instead, where each note is a kit piece.
 */
export const GENERAL_MIDI_PROGRAM: Record<InstrumentId, number> = {
  piano: 0,
  guitar: 25,
  bass: 33,
  trumpet: 56,
  flute: 73,
  trombone: 57,
  violin: 40,
  viola: 41,
  cello: 42,
  doublebass: 43,
  drums: 0,
};
