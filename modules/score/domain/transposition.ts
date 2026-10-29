import { INSTRUMENTS, type InstrumentId, type Transposition } from "./instruments";
import { spellMidi } from "./key";
import { midiPitch, STEPS } from "./pitch";
import type { KeySignature, Pitch } from "./schema";

/**
 * Transposing instruments read music written above (or below) what they sound. Scores store
 * concert pitch; these functions give the written pitch and key a player of the part reads.
 */

const FIFTHS_PER_SEMITONE = 7;
const OCTAVE = 12;
/** Beyond six sharps or flats, the enharmonic key with fewer accidentals is written. */
const MAX_WRITTEN_FIFTHS = 6;

/** The instrument's transposition, or null when it is written as it sounds. */
export const transpositionOf = (instrument: InstrumentId): Transposition | null =>
  INSTRUMENTS[instrument].transposition ?? null;

function shiftedFifths(key: KeySignature, t: Transposition) {
  const shift = (((FIFTHS_PER_SEMITONE * t.semitones) % OCTAVE) + OCTAVE) % OCTAVE;
  const fifths = key.fifths + (shift > MAX_WRITTEN_FIFTHS ? shift - OCTAVE : shift);
  if (shift === 0) return { fifths: key.fifths, wrapped: false };
  if (fifths > MAX_WRITTEN_FIFTHS) return { fifths: fifths - OCTAVE, wrapped: true };
  if (fifths < -MAX_WRITTEN_FIFTHS) return { fifths: fifths + OCTAVE, wrapped: true };
  return { fifths, wrapped: false };
}

/** The key the part is written in: concert E♭ major is F major for a B♭ trumpet, F♯ major A♭ (not G♯). */
export function writtenKey(key: KeySignature, t: Transposition): KeySignature {
  return { ...key, fifths: shiftedFifths(key, t).fifths };
}

/** A pitch moved by staff steps and semitones; respelled in `key` when the letters would not fit. */
function shift(pitch: Pitch, steps: number, semitones: number, key: KeySignature, respell: boolean): Pitch {
  const midi = midiPitch(pitch) + semitones;
  const position = pitch.octave * STEPS.length + STEPS.indexOf(pitch.step) + steps;
  const step = STEPS[((position % STEPS.length) + STEPS.length) % STEPS.length];
  const octave = Math.floor(position / STEPS.length);
  const alter = midi - midiPitch({ step, alter: 0, octave });
  if (respell || Math.abs(alter) > 1) return spellMidi(midi, key);
  return { step, alter: alter as Pitch["alter"], octave };
}

/** The written pitch of a sounding (concert) pitch, in the part's written key. */
export function toWritten(pitch: Pitch, t: Transposition, concertKey: KeySignature): Pitch {
  const { wrapped } = shiftedFifths(concertKey, t);
  return shift(pitch, t.steps, t.semitones, writtenKey(concertKey, t), wrapped);
}

/** The sounding (concert) pitch of a written pitch: the inverse of `toWritten`. */
export function toConcert(pitch: Pitch, t: Transposition, concertKey: KeySignature): Pitch {
  const { wrapped } = shiftedFifths(concertKey, t);
  return shift(pitch, -t.steps, -t.semitones, concertKey, wrapped);
}
