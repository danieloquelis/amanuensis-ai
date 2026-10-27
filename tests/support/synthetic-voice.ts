import type { Signal } from "@/modules/voice";

/** A melody note to sing: MIDI pitch (null = rest) and length in quarter-note beats. */
export type SungNoteSpec = { midi: number | null; beats: number };

export type SingerOptions = {
  bpm: number;
  sampleRate?: number;
  /** Vibrato depth, cents either side. */
  vibratoCents?: number;
  /** Pitch glide into each new note. */
  glideSeconds?: number;
  /** Whole-take detuning: positive sings sharp. */
  tuningCents?: number;
  /** Random onset displacement, seconds either side. */
  timingJitter?: number;
  /** Breath/room noise level (0–1). */
  noise?: number;
  /** Each note lands up to this many cents off, at random: nobody has perfect pitch. */
  pitchErrorCents?: number;
  /** Tuning that wanders linearly over the take (cents at the end). */
  driftCents?: number;
  seed?: number;
};

/** Deterministic pseudo-random numbers (mulberry32) so synthetic takes are reproducible. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORMANTS = [
  [730, 90, 1],
  [1090, 110, 0.5],
  [2440, 160, 0.25],
] as const;

/**
 * Sings a melody on "ah": harmonics shaped by vowel formants, vibrato, glides, a consonant dip
 * before repeated pitches, plus optional detuning, timing jitter and noise.
 */
export function singMelody(melody: SungNoteSpec[], options: SingerOptions): Signal {
  const rate = options.sampleRate ?? 24_000;
  const rand = random(options.seed ?? 1);
  const beat = 60 / options.bpm;
  const total = melody.reduce((sum, n) => sum + n.beats, 0) * beat + 0.5;
  const samples = new Float32Array(Math.ceil(total * rate));
  const tuning = 2 ** ((options.tuningCents ?? 0) / 1200);
  let time = 0.2;
  let previousMidi: number | null = null;
  const totalBeats = melody.reduce((sum, n) => sum + n.beats, 0);
  let elapsedBeats = 0;
  let phase = 0;
  for (const note of melody) {
    const length = note.beats * beat;
    const jitter = ((rand() - 0.5) * 2 * (options.timingJitter ?? 0)) / 1;
    const start = Math.max(0, time + jitter);
    if (note.midi !== null) {
      const from = previousMidi ?? note.midi;
      const repeated = previousMidi === note.midi;
      const miss = (rand() - 0.5) * 2 * (options.pitchErrorCents ?? 0);
      const drift = ((options.driftCents ?? 0) * elapsedBeats) / totalBeats;
      const offTune = 2 ** ((miss + drift) / 1200);
      const first = Math.round(start * rate);
      const last = Math.min(samples.length, Math.round((time + length) * rate));
      for (let i = first; i < last; i++) {
        const t = (i - first) / rate;
        const glide = options.glideSeconds ? Math.min(1, t / options.glideSeconds) : 1;
        const midi = from + (note.midi - from) * glide;
        const vibrato = ((options.vibratoCents ?? 0) / 100) * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.25);
        const f0 = 440 * 2 ** ((midi + vibrato - 69) / 12) * tuning * offTune;
        phase += (2 * Math.PI * f0) / rate;
        // A consonant ("la") briefly silences a re-sung pitch; every note fades in and out.
        const attack = repeated ? Math.min(1, Math.max(0, (t - 0.04) / 0.03)) : Math.min(1, t / 0.03);
        const release = Math.min(1, (last - i) / (0.03 * rate));
        // Glottal source (every harmonic present, falling ~12 dB/octave) shaped by vowel formants.
        let value = 0;
        let norm = 0;
        for (let h = 1; h * f0 < 4000; h++) {
          const formant = FORMANTS.reduce(
            (sum, [center, width, level]) => sum + level * Math.exp(-(((h * f0 - center) / width) ** 2)),
            0,
          );
          const gain = (1 + 3 * formant) / (h * h);
          value += gain * Math.sin(h * phase);
          norm += gain;
        }
        samples[i] = (value / norm) * attack * release * 0.5;
      }
    }
    previousMidi = note.midi;
    time += length;
    elapsedBeats += note.beats;
  }
  const noise = options.noise ?? 0;
  for (let i = 0; i < samples.length; i++) samples[i] += (rand() - 0.5) * 2 * noise;
  return { samples, sampleRate: rate };
}

/** MIDI numbers for readable melodies: midi("C4") = 60. */
export function midi(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`Bad note name ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1] as "C"];
  return (Number(match[3]) + 1) * 12 + base + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
}
