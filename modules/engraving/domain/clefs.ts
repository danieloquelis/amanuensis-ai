import {
  allStaves,
  isPlayable,
  midiPitch,
  scoreKey,
  staffPosition,
  toWritten,
  transpositionOf,
  voiceBars,
  voiceInfo,
  writtenKey,
  type Clef,
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

/** Key signature accidentals sit this many staff steps lower on a bass staff than on a treble one. */
const BASS_KEY_SHIFT = -2;

/** How far a clef's key signature accidentals sit from the treble positions. */
export const keyShift = (clef: Clef) => (clef === "bass" ? BASS_KEY_SHIFT : 0);

/** The clef of the staff being drawn. Scores show one staff for now: the first. */
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
  const sounding = new Map<string, Pitch>();
  const view = structuredClone(score);
  const concertKey = scoreKey(score);
  const t = concertPitch ? null : transpositionOf(score.parts[0].instrument);
  for (const measure of view.measures)
    for (const voiceBar of voiceBars(measure)) {
      const { instrument } = voiceInfo(score, voiceBar.voiceId)!.part;
      for (const event of voiceBar.events) {
        if (!event.pitch) continue;
        if (!isPlayable(midiPitch(event.pitch), instrument)) outOfRange.add(event.id);
        if (!t) continue;
        sounding.set(event.id, event.pitch);
        event.pitch = toWritten(event.pitch, t, concertKey);
      }
    }
  if (t) view.key = writtenKey(concertKey, t);
  return { score: view, outOfRange, sounding };
}
