import { measureCapacity, spellMidi, type KeySignature, type Meter, type Pitch } from "@/modules/score";
import { barEvidence, type BarEvidence } from "./evidence";
import { fitHarmony, fitToChords, snapToChordTones } from "./harmonic-fit";
import { estimateKey, resolvePitches, tuneToScale, type ChordContext, type ResolvedNote } from "./musical-priors";
import { segmentNotes, type SungNote } from "./notes";
import { trackPitch, type PitchFrame, type Signal } from "./pitch-tracker";
import { placeNotes, toBars } from "./rhythm";
import { beatAt, readRhythm, typicalTempo } from "./tempo-map";

export type MelodyOptions = {
  bpm?: number;
  meter?: Meter;
  key?: KeySignature;
  /** Chords the singer sang over; notes sung between two pitches lean to the chord's tones. */
  chords?: ChordContext[];
  /** Where the first sung note falls in bar 1 (quarter beats). Found from the chords if omitted. */
  startBeat?: number;
  /** The tune is built from chord tones (arpeggios, riffs): notes within a semitone snap to one. */
  snapToChordTones?: boolean;
  /** A transposition already fitted across the whole take (see `transcribeSpans`). */
  shift?: number;
  /** How many bars the musician said the phrase fills; it settles double/half-tempo readings. */
  bars?: number;
  /** Pitch frames for the signal from a better tracker; YIN's own are used otherwise. */
  frames?: PitchFrame[];
};

export type MelodyTranscription = {
  /** Detected notes with their real timing, for evidence and review. */
  notes: ResolvedNote[];
  /** Octaves added so the melody sits on the treble staff (a low voice is written higher). */
  octaveShift: number;
  /** The key used to resolve pitches: the one given, or the one the melody implies. */
  key: KeySignature;
  keyWasGiven: boolean;
  /** Semitones the take was moved to sit in the given key (0 when no key was given). */
  transposedBy: number;
  /** Where the first sung note falls in bar 1, in quarter beats. */
  startBeat: number;
  /** False when the start was assumed or inferred without a clear winner. */
  startBeatSure: boolean;
  bpm: number;
  /** The slowest and fastest local tempo the rhythm was read with: the singer's drift. */
  tempoDrift: [number, number];
  tempoWasGiven: boolean;
  meter: Meter;
  /** Bars ready for `replaceMeasure`: written pitch (null = rest), duration in beats, tie. */
  bars: { pitch: Pitch | null; duration: number; tie?: boolean }[][];
  /** Notes sung between two pitches: where they are (bar from 1, beat from 0) and the other reading. */
  uncertain: { bar: number; beat: number; written: Pitch; alternative: Pitch }[];
  /** Per bar: how sure the ear is, and which bars share a rhythm (a repeated figure). */
  evidence: BarEvidence[];
  warnings: string[];
};

const FOUR_FOUR: Meter = { numerator: 4, denominator: 4 };
/** The treble staff's comfortable middle (G4): melodies are written by whole octaves near it. */
const TREBLE_CENTRE = 67;
const OCTAVE_LIMITS = { low: 48, high: 95 };

/**
 * Whole octaves that move the melody's median toward G4 (men often sing an octave below where
 * a treble staff writes the tune), never pushing a note outside the score's range.
 */
function octaveShiftFor(notes: SungNote[]): number {
  if (!notes.length) return 0;
  const pitches = notes.map((n) => Math.round(n.midi)).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)];
  let shift = Math.round((TREBLE_CENTRE - median) / 12);
  while (shift > 0 && pitches.at(-1)! + shift * 12 > OCTAVE_LIMITS.high) shift--;
  while (shift < 0 && pitches[0] + shift * 12 < OCTAVE_LIMITS.low) shift++;
  return shift;
}

/**
 * The rhythm of the sung notes, read on a tempo that may drift (see `readRhythm`): their places
 * in beats from the first note, the typical tempo, and where the rhythm alone puts the first
 * note in its bar (harmony may move it by whole beats).
 */
function readTiming(notes: SungNote[], meter: Meter, options: MelodyOptions) {
  if (!notes.length) {
    const bpm = options.bpm ?? 0;
    return { placed: [], bpm, drift: [bpm, bpm] as [number, number], rhythmStart: options.startBeat ?? 0 };
  }
  const onsets = notes.map((n) => n.start);
  const reading = readRhythm(onsets, {
    barBeats: measureCapacity(meter),
    bpm: options.bpm,
    startBeat: options.startBeat,
    bars: options.bars,
  });
  const first = reading.positions[0];
  const placed = placeNotes(
    notes,
    reading.positions.map((p) => p - first),
    notes.map((n) => beatAt(onsets, reading, n.end) - first),
  );
  const drift: [number, number] = [Math.min(...reading.tempi), Math.max(...reading.tempi)];
  return { placed, bpm: options.bpm ?? typicalTempo(reading), drift, rhythmStart: first };
}

/**
 * Sung audio → notated melody: pitch tracking, note segmentation, tempo (spoken or estimated)
 * and rhythm; then, against a given key and chords, the transposition the singer meant and where
 * the phrase starts in the bar; tuning followed against the key; pitches resolved by key and
 * chords; spelling in the key. Deterministic and local: no model calls.
 */
export function transcribeMelody(signal: Signal, options: MelodyOptions = {}): MelodyTranscription {
  const meter = options.meter ?? FOUR_FOUR;
  const raw = segmentNotes(options.frames ?? trackPitch(signal));
  // Rhythm depends only on timing, so it is settled first; harmony then uses the onsets.
  const { placed, bpm, drift, rhythmStart } = readTiming(raw, meter, options);
  const sungOnsets = placed.filter((p) => p.midi !== null).map((p) => p.start);
  const fit = options.key
    ? fitHarmony(raw, sungOnsets, options.key, {
        meter,
        chords: options.chords,
        startBeat: options.startBeat ?? (options.chords?.length ? undefined : rhythmStart),
        // The rhythm knows whether the phrase starts on or off the beat; chords say which beat.
        starts: Array.from({ length: measureCapacity(meter) }, (_, k) => (rhythmStart + k) % measureCapacity(meter)),
        shift: options.shift,
      })
    : {
        transposedBy: 0,
        shift: 0,
        startBeat: options.startBeat ?? rhythmStart,
        startBeatSure: options.startBeat !== undefined,
        notes: tuneToScale(raw),
      };
  const key = options.key ?? estimateKey(fit.notes);
  const octaveShift = octaveShiftFor(fit.notes);
  const resolved = resolvePitches(fit.notes, key).map((note) => ({
    ...note,
    midi: note.midi + octaveShift * 12,
    pitch: note.pitch + octaveShift * 12,
    alternative: note.alternative === null ? null : note.alternative + octaveShift * 12,
  }));
  const onsets = sungOnsets.map((onset) => onset + fit.startBeat);
  const chords = options.chords ?? [];
  const notes = !chords.length
    ? resolved
    : options.snapToChordTones
      ? snapToChordTones(resolved, onsets, chords)
      : fitToChords(resolved, onsets, chords);
  let next = 0;
  const lead = fit.startBeat ? [{ midi: null, start: 0, beats: fit.startBeat }] : [];
  const bars = toBars(
    [
      ...lead,
      ...placed.map((p) => ({
        ...p,
        start: p.start + fit.startBeat,
        midi: p.midi === null ? null : notes[next++].pitch,
      })),
    ],
    meter,
  );
  const capacity = measureCapacity(meter);
  return {
    notes,
    octaveShift,
    key,
    keyWasGiven: options.key !== undefined,
    transposedBy: fit.transposedBy,
    startBeat: fit.startBeat,
    startBeatSure: fit.startBeatSure,
    bpm,
    tempoDrift: drift,
    tempoWasGiven: options.bpm !== undefined,
    meter,
    bars: bars.map((bar) =>
      bar.map((e) => ({
        pitch: e.midi === null ? null : spellMidi(e.midi, key),
        duration: e.beats,
        ...(e.tie ? { tie: true } : {}),
      })),
    ),
    uncertain: notes.flatMap((note, i) => {
      if (note.alternative === null) return [];
      const bar = Math.floor(onsets[i] / capacity) + 1;
      const beat = onsets[i] - (bar - 1) * capacity;
      return [{ bar, beat, written: spellMidi(note.pitch, key), alternative: spellMidi(note.alternative, key) }];
    }),
    evidence: barEvidence(notes, onsets, bars, capacity),
    warnings: notes.length ? [] : ["No sung notes were found."],
  };
}
