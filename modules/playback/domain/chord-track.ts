import { barStyle, CHORD_QUALITIES, pitchClass, type Chord, type Score } from "@/modules/score";
import { soundingSource } from "./performance-order";

const MAX_UPPER_VOICES = 4;
/** Lowest MIDI notes for the bass (E2) and the upper voicing (E3). */
const BASS_FLOOR = 40;
const VOICING_FLOOR = 52;

export type ChordSegment = { beat: number; chord: Chord };

/**
 * The harmony of every written bar, from beat 0: a chord holds until the next chord symbol in the
 * written score, and a repeat (%) bar without chords of its own repeats its source bar's harmony.
 */
export function writtenChordSegments(score: Score): ChordSegment[][] {
  const result: ChordSegment[][] = [];
  let carry: Chord | null = null;
  score.measures.forEach((measure, index) => {
    const own = score.chords.filter((c) => c.measureId === measure.id).sort((a, b) => a.beat - b.beat);
    let segments: ChordSegment[];
    if (!own.length && barStyle(measure) === "repeat") {
      segments = result[soundingSource(score, index)];
    } else {
      segments = own.map((chord) => ({ beat: chord.beat, chord }));
      if (carry && (!own.length || own[0].beat > 0)) segments.unshift({ beat: 0, chord: carry });
    }
    carry = segments.at(-1)?.chord ?? carry;
    result.push(segments);
  });
  return result;
}

/** A compact close voicing as MIDI notes: bass note low, chord tones above, at most four upper voices. */
export function voiceChord(chord: Chord): number[] {
  const bass = BASS_FLOOR + ((pitchClass(chord.bass ?? chord.root) - (BASS_FLOOR % 12) + 12) % 12);
  const root = VOICING_FLOOR + ((pitchClass(chord.root) - (VOICING_FLOOR % 12) + 12) % 12);
  const intervals: readonly number[] = CHORD_QUALITIES[chord.quality];
  // Drop the fifth first when the chord has more tones than voices.
  const chosen = intervals.length > MAX_UPPER_VOICES ? intervals.filter((i) => i !== 7) : intervals;
  return [bass, ...chosen.slice(0, MAX_UPPER_VOICES).map((i) => root + i)];
}
