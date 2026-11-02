import { against, averagePitch, melodic, soundingAt, type VoiceLine, type VoiceNote } from "./band-voices";

// How two voices move against each other, as a teacher of counterpoint hears it.

const EPSILON = 1e-6;
const OCTAVE = 12;
const FIFTH = 7;
/** Perfect intervals moving in parallel this many times in a row are a doubling, not a slip. */
const DOUBLING_RUN = 4;

/** Two voices moving together into the same perfect interval, at these bars (from 0). */
export type Parallels = { upper: VoiceLine; lower: VoiceLine; bars: number[]; doubled: number[] };

const perfect = (interval: number) => {
  const kind = ((interval % OCTAVE) + OCTAVE) % OCTAVE;
  return kind === 0 || kind === FIFTH ? kind : null;
};

/** The moments either voice strikes a note, in order. */
function attacks(a: VoiceLine, b: VoiceLine): number[] {
  const times = [...a.notes, ...b.notes].map((note) => note.start).sort((x, y) => x - y);
  return times.filter((time, i) => i === 0 || time - times[i - 1] > EPSILON);
}

const startsAt = (note: VoiceNote | null, time: number) => note !== null && Math.abs(note.start - time) < EPSILON;

/**
 * Parallel fifths and octaves between two voices: both move, the same way, from one perfect
 * interval into the same one. A long run of them is a doubling (in octaves on purpose), kept apart.
 */
export function parallels(a: VoiceLine, b: VoiceLine): Parallels {
  const [upper, lower] = averagePitch(a) >= averagePitch(b) ? [a, b] : [b, a];
  const found: number[] = [];
  const doubled: number[] = [];
  let run: number[] = [];
  const close = () => {
    (run.length >= DOUBLING_RUN ? doubled : found).push(...run);
    run = [];
  };
  let previous: { hi: number; lo: number } | null = null;
  for (const time of attacks(upper, lower)) {
    const hi = soundingAt(upper, time);
    const lo = soundingAt(lower, time);
    if (!hi || !lo) {
      close();
      previous = null;
      continue;
    }
    const [h, l] = against(hi, lo);
    const both = startsAt(hi, time) && startsAt(lo, time);
    if (previous && both) {
      const same = perfect(previous.hi - previous.lo);
      const moved = h !== previous.hi && l !== previous.lo && Math.sign(h - previous.hi) === Math.sign(l - previous.lo);
      if (same !== null && same === perfect(h - l) && moved) run.push(hi.bar);
      else close();
    } else if (startsAt(hi, time) || startsAt(lo, time)) close();
    previous = { hi: h, lo: l };
  }
  close();
  return { upper, lower, bars: found, doubled };
}

/** Shares of the bars two voices both play in where they strike at exactly the same moments. */
export function sameRhythm(a: VoiceLine, b: VoiceLine): { share: number; bars: number[] } {
  const byBar = (line: VoiceLine) => {
    const bars = new Map<number, string[]>();
    for (const note of line.notes) bars.set(note.bar, [...(bars.get(note.bar) ?? []), note.start.toFixed(3)]);
    return bars;
  };
  const [x, y] = [byBar(a), byBar(b)];
  const shared = [...x.keys()].filter((bar) => y.has(bar) && (x.get(bar)!.length > 1 || y.get(bar)!.length > 1));
  const same = shared.filter((bar) => x.get(bar)!.join() === y.get(bar)!.join());
  return { share: shared.length ? same.length / shared.length : 0, bars: same };
}

/** A run of at least this many notes going one way by step is a scale. */
const SCALE_RUN = 6;
const STEP = 2;

/** The share of a voice's notes that sit in scale runs (six or more notes stepping one way). */
export function scaleShare(line: VoiceLine): number {
  const pitches = line.notes.map(melodic);
  const inRun = new Set<number>();
  let from = 0;
  for (let i = 1; i <= pitches.length; i++) {
    const step = pitches[i] - pitches[i - 1];
    const direction = Math.sign(pitches[from + 1] - pitches[from]);
    const continues =
      i < pitches.length && Math.abs(step) >= 1 && Math.abs(step) <= STEP && Math.sign(step) === direction;
    if (continues) continue;
    if (i - from >= SCALE_RUN) for (let k = from; k < i; k++) inRun.add(k);
    from = i - 1;
  }
  return pitches.length ? inRun.size / pitches.length : 0;
}

/** How many different note lengths a voice uses. */
export const noteLengths = (line: VoiceLine) =>
  new Set(line.notes.map((note) => (note.end - note.start).toFixed(3))).size;

/** The share of a voice's notes shorter than a beat: how much it moves. */
export const quickShare = (line: VoiceLine) =>
  line.notes.length ? line.notes.filter((note) => note.end - note.start < 1 - EPSILON).length / line.notes.length : 0;

/** Phrases a voice plays again note for note: each two-bar stretch and how many times it is heard. */
export function literalRepeats(line: VoiceLine): { times: number; bars: number[] } {
  const byBar = new Map<number, string[]>();
  for (const note of line.notes) {
    const at = (note.start - Math.floor(note.start)).toFixed(3);
    byBar.set(note.bar, [
      ...(byBar.get(note.bar) ?? []),
      `${note.beat.toFixed(3)}:${note.midi.join(".")}:${(note.end - note.start).toFixed(3)}:${at}`,
    ]);
  }
  const bars = [...byBar.keys()].sort((a, b) => a - b);
  const seen = new Map<string, number[]>();
  for (const bar of bars) {
    if (!byBar.has(bar + 1)) continue;
    const key = `${byBar.get(bar)!.join(" ")}|${byBar.get(bar + 1)!.join(" ")}`;
    seen.set(key, [...(seen.get(key) ?? []), bar]);
  }
  let best = { times: 0, bars: [] as number[] };
  for (const starts of seen.values()) {
    // Overlapping stretches of one long repeat count once each two bars.
    const apart = starts.filter((bar, i) => i === 0 || bar - starts[i - 1] >= 2);
    if (apart.length > best.times) best = { times: apart.length, bars: apart };
  }
  return best;
}
