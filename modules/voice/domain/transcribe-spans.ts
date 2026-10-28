import { measureCapacity, type KeySignature, type Meter } from "@/modules/score";
import { fitHarmony } from "./harmonic-fit";
import type { ChordContext } from "./musical-priors";
import { segmentNotes } from "./notes";
import { trackPitch, type PitchFrame, type Signal } from "./pitch-tracker";
import { quantizeNotes } from "./rhythm";
import { transcribeMelody, type MelodyTranscription } from "./transcribe-melody";

/**
 * One sung stretch and the bar it was meant for. `startBeat` is where it begins in that bar,
 * `bars` how many bars it fills (when said), `frames` its pitch from a better tracker.
 */
export type PlacedSpan = { signal: Signal; bar: number; startBeat?: number; bars?: number; frames?: PitchFrame[] };

export type SpansOptions = {
  bpm: number;
  meter: Meter;
  key?: KeySignature;
  /** Chords across the score, `beat` counted in quarter beats from the start of bar 1. */
  chords?: ChordContext[];
  snapToChordTones?: boolean;
};

const START_STEP = 0.5;

/** Chords as heard from `fromBeat` on: the one already sounding starts at 0, later ones shift. */
function chordsFrom(chords: ChordContext[], fromBeat: number): ChordContext[] {
  const sorted = [...chords].sort((a, b) => a.beat - b.beat);
  const sounding = sorted.findLast((c) => c.beat <= fromBeat);
  const later = sorted.filter((c) => c.beat > fromBeat).map((c) => ({ ...c, beat: c.beat - fromBeat }));
  return [...(sounding ? [{ ...sounding, beat: 0 }] : []), ...later];
}

/**
 * A span shorter than its bar was sung to fill it: a figure that starts after an eighth rest is
 * 3.5 beats long in 4/4, so it starts at 0.5. Longer spans start on the downbeat unless told.
 */
function fillingStart(beats: number, capacity: number): number | undefined {
  if (beats >= capacity) return undefined;
  return Math.max(0, Math.min(capacity - START_STEP, Math.round((capacity - beats) / START_STEP) * START_STEP));
}

/**
 * Transcribes several sung stretches of one take, as when a musician talks between bars ("in the
 * second bar…") and sings each. One take has one pitch reference, so the transposition into the
 * key is fitted across all of them together, then each is written from its own bar.
 */
export function transcribeSpans(spans: PlacedSpan[], options: SpansOptions): MelodyTranscription[] {
  const capacity = measureCapacity(options.meter);
  const beatSeconds = 60 / options.bpm;
  const heard = spans.map((span) => {
    const notes = segmentNotes(span.frames ?? trackPitch(span.signal));
    const length = notes.length ? (notes.at(-1)!.end - notes[0].start) / beatSeconds : 0;
    const startBeat = span.startBeat ?? fillingStart(length, capacity);
    const offset = (span.bar - 1) * capacity + (startBeat ?? 0);
    const onsets = quantizeNotes(notes, options.bpm)
      .filter((p) => p.midi !== null)
      .map((p) => p.start + offset);
    return { notes, onsets, startBeat };
  });
  const shift = options.key
    ? fitHarmony(
        heard.flatMap((h) => h.notes),
        heard.flatMap((h) => h.onsets),
        options.key,
        { meter: options.meter, chords: options.chords, startBeat: 0 },
      ).shift
    : undefined;
  return spans.map((span, i) => {
    const chords = chordsFrom(options.chords ?? [], (span.bar - 1) * capacity);
    return transcribeMelody(span.signal, {
      bpm: options.bpm,
      meter: options.meter,
      key: options.key,
      chords,
      startBeat: heard[i].startBeat,
      snapToChordTones: options.snapToChordTones,
      shift,
      bars: span.bars,
      frames: span.frames,
    });
  });
}
