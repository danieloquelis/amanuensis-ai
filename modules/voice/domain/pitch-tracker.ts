/** Mono audio as floats in [-1, 1]. */
export type Signal = { samples: Float32Array; sampleRate: number };

/** One analysis frame: the sung fundamental, or null when there is no clear pitch. */
export type PitchFrame = { time: number; frequency: number | null; clarity: number; rms: number };

/** Sung fundamentals stay within this range (a low bass to a high soprano). */
export const VOICE_RANGE_HZ = { min: 70, max: 1100 } as const;
const HOP_SECONDS = 0.01;
const WINDOW_SECONDS = 0.02;
/** YIN aperiodicity threshold: lower is stricter about what counts as pitched. */
const YIN_THRESHOLD = 0.15;
/**
 * A dip counts as the period only if it is nearly as deep as the deepest one. Voices often have
 * a stronger 2nd harmonic than fundamental, which leaves a shallower dip at half the period.
 */
const OCTAVE_TOLERANCE = 0.06;
/** Frames quieter than this (RMS, after peak normalization) are treated as silence. */
const SILENCE_RMS = 0.02;

/**
 * YIN fundamental-frequency estimation (de Cheveigné & Kawahara, 2002), one frame every 10 ms.
 * Returns null frequencies for silence, breath and noise, with a clarity score in [0, 1].
 */
export function trackPitch(signal: Signal): PitchFrame[] {
  const { samples, sampleRate } = normalize(signal);
  const hop = Math.round(HOP_SECONDS * sampleRate);
  const window = Math.round(WINDOW_SECONDS * sampleRate);
  const minLag = Math.floor(sampleRate / VOICE_RANGE_HZ.max);
  const maxLag = Math.ceil(sampleRate / VOICE_RANGE_HZ.min);
  const difference = new Float32Array(maxLag + 1);
  const frames: PitchFrame[] = [];
  for (let start = 0; start + window + maxLag < samples.length; start += hop) {
    const rms = rootMeanSquare(samples, start, window);
    const time = (start + window / 2) / sampleRate;
    if (rms < SILENCE_RMS) {
      frames.push({ time, frequency: null, clarity: 0, rms });
      continue;
    }
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < window; i++) {
        const delta = samples[start + i] - samples[start + i + lag];
        sum += delta * delta;
      }
      difference[lag] = sum;
    }
    const lag = bestLag(difference, minLag, maxLag);
    if (lag === null) {
      frames.push({ time, frequency: null, clarity: 0, rms });
      continue;
    }
    frames.push({ time, frequency: sampleRate / lag.value, clarity: 1 - lag.aperiodicity, rms });
  }
  return frames;
}

/** Scales the take so its loudest sample is near full scale: quiet microphones still read as sung. */
function normalize(signal: Signal): Signal {
  let peak = 0;
  for (const sample of signal.samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0 || peak > 0.9) return signal;
  const gain = 0.9 / peak;
  return { ...signal, samples: signal.samples.map((sample) => sample * gain) };
}

function rootMeanSquare(samples: Float32Array, start: number, length: number): number {
  let sum = 0;
  for (let i = start; i < start + length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / length);
}

/**
 * Cumulative-mean-normalized difference; the earliest local dip under the threshold that is
 * nearly as deep as the deepest dip, refined by a parabola.
 */
function bestLag(difference: Float32Array, minLag: number, maxLag: number) {
  const normalized = new Float32Array(maxLag + 1);
  normalized[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += difference[lag];
    normalized[lag] = running ? (difference[lag] * lag) / running : 1;
  }
  let deepest = Infinity;
  for (let lag = minLag; lag < maxLag; lag++) deepest = Math.min(deepest, normalized[lag]);
  if (deepest >= YIN_THRESHOLD) return null;
  let lag = minLag;
  const isDip = (l: number) => normalized[l] <= normalized[l - 1] && normalized[l] <= normalized[l + 1];
  while (
    lag < maxLag &&
    !(isDip(lag) && normalized[lag] < YIN_THRESHOLD && normalized[lag] <= deepest + OCTAVE_TOLERANCE)
  ) {
    lag++;
  }
  if (lag >= maxLag) return null;
  const [a, b, c] = [normalized[lag - 1], normalized[lag], normalized[lag + 1]];
  const shift = a + c - 2 * b ? (a - c) / (2 * (a + c - 2 * b)) : 0;
  return { value: lag + Math.max(-1, Math.min(1, shift)), aperiodicity: b };
}
