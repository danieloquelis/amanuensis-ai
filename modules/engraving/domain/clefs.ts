import {
  allStaves,
  eventPitches,
  isDrumKit,
  isPlayable,
  midiPitch,
  scoreKey,
  staffPosition,
  toWritten,
  transpositionOf,
  voiceBars,
  voiceInfo,
  writtenKey,
  type ChordRoot,
  type Clef,
  type InstrumentId,
  type KeySignature,
  type Pitch,
  type Score,
} from "@/modules/score";

const E4 = staffPosition({ step: "E", octave: 4, alter: 0 });
const G2 = staffPosition({ step: "G", octave: 2, alter: 0 });

/** Staff position of each clef's bottom line, for the pitches as the staff shows them. */
export const CLEF_BOTTOM_LINE: Record<Clef, number> = {
  treble: E4,
  // Guitar music is already written an octave up (see transposition), so it sits like treble.
  treble8vb: E4,
  bass: G2,
  percussion: E4,
};

const NO_KEY: KeySignature = { fifths: 0, mode: "major" };

/** Any octave will do for spelling a chord root. */
const CHORD_OCTAVE = 4;

/** Key signature accidentals sit this many staff steps lower on a bass staff than on a treble one. */
const BASS_KEY_SHIFT = -2;

/** How far a clef's key signature accidentals sit from the treble positions. */
export const keyShift = (clef: Clef) => (clef === "bass" ? BASS_KEY_SHIFT : 0);

/** The clef of the system's first staff. */
export const staffClef = (score: Score): Clef => allStaves(score)[0].clef;

/** Spoken name of a clef, for labels. */
export const CLEF_NAMES: Record<Clef, string> = {
  treble: "treble",
  treble8vb: "treble 8vb",
  bass: "bass",
  percussion: "percussion",
};

/**
 * The score as the staff shows it. Pitches are stored as they sound; a transposing part (B♭
 * trumpet, guitar) is drawn in written pitch and its written key unless `concertPitch` is on.
 * Also returns the notes outside their instrument's range, judged by their sound, and the
 * sounding pitch of every note shown transposed.
 */
export function writtenView(score: Score, concertPitch: boolean) {
  const outOfRange = new Set<string>();
  const sounding = new Map<string, Pitch[]>();
  const view = structuredClone(score);
  const concertKey = scoreKey(score);
  // Each part is written in its own key: a B♭ trumpet a tone above the piano.
  const transposition = (instrument: InstrumentId) => (concertPitch ? null : transpositionOf(instrument));
  const staffKeys = new Map<string, KeySignature>();
  for (const part of score.parts) {
    const t = transposition(part.instrument);
    // A drum staff has no key: its hits have no pitch.
    const key = isDrumKit(part.instrument) ? NO_KEY : t ? writtenKey(concertKey, t) : concertKey;
    for (const staff of part.staves) staffKeys.set(staff.id, key);
  }
  for (const measure of view.measures)
    for (const voiceBar of voiceBars(measure)) {
      const { instrument } = voiceInfo(score, voiceBar.voiceId)!.part;
      const t = transposition(instrument);
      for (const event of voiceBar.events) {
        const notes = eventPitches(event);
        if (!notes.length) continue;
        if (notes.some((p) => !isPlayable(midiPitch(p), instrument))) outOfRange.add(event.id);
        if (!t) continue;
        sounding.set(event.id, notes);
        event.pitch = toWritten(event.pitch!, t, concertKey);
        if (event.stack) event.stack = event.stack.map((p) => toWritten(p, t, concertKey));
      }
    }
  // Chord symbols sit above the top staff, so they read in its key: a tone up over a B♭ trumpet.
  const top = transposition(score.parts[0].instrument);
  const written = (root: ChordRoot): ChordRoot => {
    const { step, alter } = toWritten({ ...root, octave: CHORD_OCTAVE }, top!, concertKey);
    return { step, alter };
  };
  if (top)
    for (const chord of view.chords) {
      chord.root = written(chord.root);
      if (chord.bass) chord.bass = written(chord.bass);
    }
  view.key = staffKeys.get(score.parts[0].staves[0].id);
  return { score: view, outOfRange, sounding, staffKeys };
}
