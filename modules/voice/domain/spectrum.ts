import type { PitchFrame, Signal } from "./pitch-tracker";

/** Analysis window (samples at 16 kHz: 32 ms), centred on each pitch frame. */
const WINDOW = 512;
/** Harmonic-to-noise ratios are kept within this many decibels either way. */
const HARMONIC_DB_LIMIT = 30;
const MIN_HZ = 80;
const MAX_HZ = 4000;
/** The loudness envelope is examined over this many frames either side for its syllable rhythm. */
const RHYTHM_HALF_FRAMES = 50;
const RHYTHM_SIZE = 128;
/** Talk pulses its loudness at the syllable rate, about 3–8 times a second; singing holds its vowels. */
const SYLLABLE_HZ = { low: 3, high: 8 };
const ENVELOPE_HZ = { low: 0.5, high: 20 };

/**
 * What the sound of each 10 ms frame says, from its spectrum (Fourier transform): how much it
 * changed since the frame before (talk changes sound every few tens of milliseconds, a sung vowel
 * holds), how much louder the voice's harmonics are than the spectrum halfway between them (dB:
 * singing is mostly clean vowel), and how strongly the loudness around it pulses at the syllable
 * rate of talk.
 */
export type SoundFrame = { flux: number; harmonicity: number; syllableRhythm: number };

/** In-place radix-2 FFT of `re`/`im` (length a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const [cos, sin] = [Math.cos(angle * k), Math.sin(angle * k)];
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cos - im[b] * sin;
        const ti = re[b] * sin + im[b] * cos;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

const hann = Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)));

/** Magnitude spectrum of the window centred at `time`. */
function magnitudes(signal: Signal, time: number): Float64Array {
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  const centre = Math.round(time * signal.sampleRate);
  for (let i = 0; i < WINDOW; i++) re[i] = (signal.samples[centre - WINDOW / 2 + i] ?? 0) * hann[i];
  fft(re, im);
  const out = new Float64Array(WINDOW / 2);
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}

/** Share of the envelope's movement at the syllable rate, around each frame. */
function syllableRhythm(loudness: number[]): number[] {
  const frameHz = 100;
  const bin = (hz: number) => Math.round((hz * RHYTHM_SIZE) / frameHz);
  return loudness.map((_, i) => {
    const re = new Float64Array(RHYTHM_SIZE);
    const im = new Float64Array(RHYTHM_SIZE);
    const window = loudness.slice(Math.max(0, i - RHYTHM_HALF_FRAMES), i + RHYTHM_HALF_FRAMES + 1);
    const mean = window.reduce((sum, v) => sum + v, 0) / window.length;
    window.forEach((v, k) => (re[k] = v - mean));
    fft(re, im);
    let band = 0;
    let all = 0;
    for (let k = bin(ENVELOPE_HZ.low); k <= bin(ENVELOPE_HZ.high); k++) {
      const power = re[k] ** 2 + im[k] ** 2;
      all += power;
      if (k >= bin(SYLLABLE_HZ.low) && k <= bin(SYLLABLE_HZ.high)) band += power;
    }
    return all > 0 ? band / all : 0;
  });
}

/** The sound of each pitch frame of `signal` (see `SoundFrame`). */
export function soundFrames(signal: Signal, frames: PitchFrame[]): SoundFrame[] {
  const binHz = signal.sampleRate / WINDOW;
  const [low, high] = [Math.ceil(MIN_HZ / binHz), Math.floor(MAX_HZ / binHz)];
  let previous: Float64Array | null = null;
  const loudness: number[] = [];
  const partial = frames.map((frame) => {
    const spectrum = magnitudes(signal, frame.time);
    let energy = 0;
    for (let k = low; k <= high; k++) energy += spectrum[k] ** 2;
    loudness.push(Math.log(1e-6 + Math.sqrt(energy)));
    // Change since the frame before, as the spectra's normalized distance (0 the same, 2 opposite).
    let flux = 0;
    if (previous) {
      let dot = 0;
      let a = 0;
      let b = 0;
      for (let k = low; k <= high; k++) {
        dot += spectrum[k] * previous[k];
        a += spectrum[k] ** 2;
        b += previous[k] ** 2;
      }
      flux = a > 0 && b > 0 ? 1 - dot / Math.sqrt(a * b) : 0;
    }
    previous = spectrum;
    // Energy on each harmonic of f0 against energy halfway to the next one.
    let onHarmonics = 0;
    let between = 0;
    if (frame.frequency !== null) {
      for (let h = frame.frequency; h + frame.frequency / 2 < MAX_HZ; h += frame.frequency) {
        onHarmonics += spectrum[Math.round(h / binHz)] ** 2;
        between += spectrum[Math.round((h + frame.frequency / 2) / binHz)] ** 2;
      }
    }
    const ratio = 10 * Math.log10((onHarmonics + 1e-12) / (between + 1e-12));
    const harmonicity = Math.max(-HARMONIC_DB_LIMIT, Math.min(HARMONIC_DB_LIMIT, ratio)) / HARMONIC_DB_LIMIT;
    return { flux, harmonicity };
  });
  const rhythm = syllableRhythm(loudness);
  return partial.map((p, i) => ({ ...p, syllableRhythm: rhythm[i] }));
}
