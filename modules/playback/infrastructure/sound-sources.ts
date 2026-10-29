import { LAYERS, type SmplrPreset } from "smplr";
import type { SoundId } from "../application/sound-port";

/** Self-hosted samples. A new sample set goes in a new folder (v2), so cached files never go stale. */
export const SOUNDS_BASE = "/sounds/v1";
/** Opus first; AAC for browsers without Opus in Ogg. smplr picks the first one the browser plays. */
export const SOUND_FORMATS = ["ogg", "m4a"];

/**
 * The Splendid Grand Piano (public domain), cut to two velocity layers with a sample every minor
 * third: each played note is at most a semitone from its sample. The soft layer covers pp to mp,
 * the loud one mf to ff (see DYNAMIC_VELOCITY).
 */
const PIANO_LAYERS = [
  { name: "PP", velRange: [1, 76] },
  { name: "MF", velRange: [77, 127] },
] as const;
const PIANO_RANGE = { low: 21, high: 108 };
const SAMPLE_SPACING = 3;
const PIANO_RELEASE = 0.5;

type Sample = [midi: number, name: string];

/** For each target note a minor third apart, the layer's sample nearest to it. */
function sparseSamples(samples: Sample[]): Sample[] {
  const chosen = new Map<number, Sample>();
  for (let target = PIANO_RANGE.low; target <= PIANO_RANGE.high; target += SAMPLE_SPACING) {
    const nearest = samples.reduce((best, s) => (Math.abs(s[0] - target) < Math.abs(best[0] - target) ? s : best));
    chosen.set(nearest[0], nearest);
  }
  return [...chosen.values()].sort((a, b) => a[0] - b[0]);
}

function pianoLayers() {
  return PIANO_LAYERS.map(({ name, velRange }) => {
    const layer = LAYERS.find((l) => l.name === name);
    if (!layer) throw new Error(`smplr has no piano layer ${name}`);
    return { velRange: [...velRange] as [number, number], samples: sparseSamples(layer.samples as Sample[]) };
  });
}

/** Each sample covers the keys closer to it than to its neighbours, repitched. */
function keyRanges(samples: Sample[]) {
  return samples.map(([midi, sample], i) => ({
    sample,
    pitch: midi,
    keyRange: [
      i === 0 ? 0 : Math.floor((samples[i - 1][0] + midi) / 2) + 1,
      i === samples.length - 1 ? 127 : Math.floor((midi + samples[i + 1][0]) / 2),
    ] as [number, number],
  }));
}

export function pianoPreset(): SmplrPreset {
  return {
    samples: { baseUrl: `${SOUNDS_BASE}/piano`, formats: SOUND_FORMATS },
    defaults: { ampRelease: PIANO_RELEASE },
    groups: pianoLayers().map(({ velRange, samples }) => ({ velRange, regions: keyRanges(samples) })),
  };
}

/**
 * The other instruments: FluidR3 General MIDI sounds (one file per instrument, every note as
 * base64 MP3), as published by gleitz/midi-js-soundfonts.
 */
const FLUID_R3: Record<Exclude<SoundId, "piano">, string> = {
  guitar: "acoustic_guitar_nylon",
  trumpet: "trumpet",
  flute: "flute",
  trombone: "trombone",
};
const FLUID_R3_REMOTE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
const PIANO_REMOTE = "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples";

/** Where an instrument's FluidR3 file is served. */
export const soundfontUrl = (id: Exclude<SoundId, "piano">) => `${SOUNDS_BASE}/fluidr3/${FLUID_R3[id]}-mp3.js`;

/** A file served under `SOUNDS_BASE`, where it comes from, and which source it belongs to (for the fetch script). */
export type SampleFile = { file: string; url: string; source: "splendid-grand-piano" | "fluidr3-gm" };

/** Every sample file the instruments request, relative to `SOUNDS_BASE`. */
export function sampleFiles(): SampleFile[] {
  const piano = pianoLayers().flatMap(({ samples }) =>
    samples.flatMap(([, name]) =>
      SOUND_FORMATS.map((format) => ({
        file: `piano/${name}.${format}`,
        url: `${PIANO_REMOTE}/${encodeURIComponent(name)}.${format}`,
        source: "splendid-grand-piano" as const,
      })),
    ),
  );
  const others = Object.values(FLUID_R3).map((name) => ({
    file: `fluidr3/${name}-mp3.js`,
    url: `${FLUID_R3_REMOTE}/${name}-mp3.js`,
    source: "fluidr3-gm" as const,
  }));
  return [...piano, ...others];
}
