/**
 * Triplets the rhythm reading wrote straight. The reading places notes on a sixteenth grid and
 * bends its local tempo to fit, so three notes sung evenly in a beat come out as sixteenths, or an
 * eighth and two sixteenths, wherever the bend lands them. What gives them away is the singing
 * itself, against the take's tempo: three even gaps of a third of a beat. A straight sixteenth is
 * a quarter of a beat (¾ of that) and an eighth half a beat (1½ times), well apart.
 */

/** A gap counts as a triplet's when it is within this share of a third of a beat. */
const THIRD_TOLERANCE = 0.14;
/** The three gaps must be this even (largest over smallest). */
const EVEN_GAPS = 1.25;

/**
 * Where a sung triplet was written: its bar (from 1) and beat (from 0). The reading stretches the
 * note before a triplet, so its first note lands at or after the beat it was sung on: the beat it
 * is written in is the one it belongs to.
 */
export type TripletFeel = { bar: number; beat: number };

/**
 * Runs of three sung notes, each lasting about a third of a beat at the take's tempo (measured
 * to the next note), written where `positions` puts them.
 *
 * @param onsets when each sung note starts, in seconds, in order
 * @param positions where each was written, in beats from the start of bar 1
 * @param bpm the take's typical tempo (or the one given)
 */
export function tripletFeel(onsets: number[], positions: number[], bpm: number, barBeats: number): TripletFeel[] {
  const third = 60 / bpm / 3;
  const isThird = (gap: number) => Math.abs(gap / third - 1) <= THIRD_TOLERANCE;
  const found: TripletFeel[] = [];
  for (let i = 0; i + 3 < onsets.length; i++) {
    const gaps = [onsets[i + 1] - onsets[i], onsets[i + 2] - onsets[i + 1], onsets[i + 3] - onsets[i + 2]];
    if (!gaps.every(isThird) || Math.max(...gaps) / Math.min(...gaps) > EVEN_GAPS) continue;
    const at = Math.floor(positions[i] + 1e-6);
    found.push({ bar: Math.floor(at / barBeats) + 1, beat: at % barBeats });
    // A triplet's notes belong to it alone: the next run starts after it.
    i += 2;
  }
  return found;
}
