/**
 * A pitch tracker sometimes reads a stretch of a held note an octave, a twelfth (the third
 * subharmonic) or two octaves off, then comes back: a "dip" that would otherwise become an extra
 * note. Measured on a real take: runs of 0.1–0.25 s, 12 or 19 semitones below, with the same
 * pitch on both sides. A sung leap does not come back at once, so it is left alone.
 */
const ERROR_INTERVALS = [12, 19, 24];
/** How close (semitones) a run must sit to one of those intervals to be folded back. */
const INTERVAL_TOLERANCE = 1;
/** Longest run (frames of 10 ms) that counts as a dip rather than a note. */
const MAX_DIP_FRAMES = 25;
/** Unvoiced frames allowed between a dip and its neighbours (a consonant, a breath). */
const MAX_BRIDGE_FRAMES = 10;
/** The pitch before and after a dip must agree to within a step. */
const SAME_PITCH = 2.5;
/** A jump this large between frames starts a new piece. */
const PIECE_BREAK = 4;
const EDGE_FRAMES = 5;

type Piece = { from: number; to: number };

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Runs of voiced frames whose pitch moves smoothly (indexes `from`–`to`, inclusive). */
function pieces(midis: (number | null)[]): Piece[] {
  const found: Piece[] = [];
  midis.forEach((midi, i) => {
    if (midi === null) return;
    const last = found.at(-1);
    const previous = midis[i - 1];
    if (last && last.to === i - 1 && previous != null && Math.abs(midi - previous) < PIECE_BREAK) last.to = i;
    else found.push({ from: i, to: i });
  });
  return found;
}

/** Per-frame MIDI pitch with short octave, twelfth and double-octave dips folded back. */
export function foldPitchDips(midis: (number | null)[]): (number | null)[] {
  const folded = [...midis];
  const runs = pieces(midis);
  const values = (piece: Piece) => midis.slice(piece.from, piece.to + 1) as number[];
  runs.forEach((dip, i) => {
    const before = runs[i - 1];
    const after = runs[i + 1];
    if (!before || !after || dip.to - dip.from + 1 > MAX_DIP_FRAMES) return;
    if (dip.from - before.to - 1 > MAX_BRIDGE_FRAMES || after.from - dip.to - 1 > MAX_BRIDGE_FRAMES) return;
    const left = median(values(before).slice(-EDGE_FRAMES));
    const right = median(values(after).slice(0, EDGE_FRAMES));
    if (Math.abs(left - right) > SAME_PITCH) return;
    const offset = median(values(dip)) - (left + right) / 2;
    const interval = ERROR_INTERVALS.find((size) => Math.abs(Math.abs(offset) - size) <= INTERVAL_TOLERANCE);
    if (!interval) return;
    const shift = -Math.sign(offset) * interval;
    for (let frame = dip.from; frame <= dip.to; frame++) folded[frame] = midis[frame]! + shift;
  });
  return folded;
}
