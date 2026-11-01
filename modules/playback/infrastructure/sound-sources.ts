import { LAYERS, type SmplrPreset } from "smplr";
import { DRUM_PIECE_CODES, DRUM_PIECES, type DrumPiece } from "@/modules/score";
import type { SoundId } from "../application/sound-port";
import { LOUD_SAMPLE_VELOCITY } from "../domain/dynamics";

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
  { name: "PP", velRange: [1, LOUD_SAMPLE_VELOCITY - 1] },
  { name: "MF", velRange: [LOUD_SAMPLE_VELOCITY, 127] },
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
type FluidSound = Exclude<SoundId, "piano" | "drums">;
const FLUID_R3: Record<FluidSound, string> = {
  guitar: "acoustic_guitar_nylon",
  bass: "electric_bass_finger",
  trumpet: "trumpet",
  flute: "flute",
  trombone: "trombone",
};
const FLUID_R3_REMOTE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
const PIANO_REMOTE = "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples";

/** Where an instrument's FluidR3 file is served. */
export const soundfontUrl = (id: FluidSound) => `${SOUNDS_BASE}/fluidr3/${FLUID_R3[id]}-mp3.js`;

/** A file served under `SOUNDS_BASE`, where it comes from, and which source it belongs to (for the fetch script). */
export type SampleFile = { file: string; url: string; source: "splendid-grand-piano" | "fluidr3-gm" | "vcsl" };

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
  const drums = [...new Set(Object.values(DRUM_SAMPLES).flatMap(({ soft, loud }) => [soft, loud]))].flatMap((path) =>
    SOUND_FORMATS.map((format) => ({
      file: `drums/${sampleName(path)}.${format}`,
      url: `${VCSL_REMOTE}/${path.split("/").map(encodeURIComponent).join("/")}.${format}`,
      source: "vcsl" as const,
    })),
  );
  return [...piano, ...others, ...drums];
}

/**
 * The drum kit: one-shots from the Versilian Community Sample Library (CC0), a soft and a loud
 * hit per piece where VCSL has both. There is no third tom, so the floor tom is the low tom
 * tuned down. Each piece plays on its General MIDI drum note.
 */
const VCSL_REMOTE = "https://smpldsnds.github.io/sgossner-vcsl";
const KIT = "Membranophones/Struck Membranophones";
const CYMBALS = "Idiophones/Struck Idiophones";
const DRUM_SAMPLES: Record<DrumPiece, { soft: string; loud: string; semitones?: number }> = {
  kick: { soft: `${KIT}/Bass Drum 1/BDrumNew_hit_v3_rr1_Sum`, loud: `${KIT}/Bass Drum 1/BDrumNew_hit_v7_rr1_Sum` },
  snare: {
    soft: `${KIT}/Snare Drum, Modern 1/Snare2_HitSN_v5_rr1_Mid`,
    loud: `${KIT}/Snare Drum, Modern 1/Snare2_HitSN_v9_rr1_Mid`,
  },
  stick: {
    soft: `${KIT}/Snare Drum, Modern 2/Snare3M_Xstick_v2_rr1_Mid`,
    loud: `${KIT}/Snare Drum, Modern 2/Snare3M_Xstick_v2_rr1_Mid`,
  },
  tom1: { soft: `${KIT}/Tom 1/Stick/TomH_HitS_v2_rr1_Mid`, loud: `${KIT}/Tom 1/Stick/TomH_HitS_v4_rr1_Mid` },
  tom2: { soft: `${KIT}/Tom 2/Stick/TomL_HitS_v2_rr1_Mid`, loud: `${KIT}/Tom 2/Stick/TomL_HitS_v4_rr1_Mid` },
  tom3: {
    soft: `${KIT}/Tom 2/Stick/TomL_HitS_v2_rr1_Mid`,
    loud: `${KIT}/Tom 2/Stick/TomL_HitS_v4_rr1_Mid`,
    semitones: -3,
  },
  hat: {
    soft: `${CYMBALS}/Hi-Hat Cymbal/HiHat_HitC_v2_rr1_Mid`,
    loud: `${CYMBALS}/Hi-Hat Cymbal/HiHat_HitC_v4_rr1_Mid`,
  },
  hatopen: { soft: `${CYMBALS}/Hi-Hat Cymbal/HiHat_HitO_rr1_Mid`, loud: `${CYMBALS}/Hi-Hat Cymbal/HiHat_HitO_rr1_Mid` },
  hatfoot: {
    soft: `${CYMBALS}/Hi-Hat Cymbal/HiHat_Close_rr1_Mid`,
    loud: `${CYMBALS}/Hi-Hat Cymbal/HiHat_Close_rr1_Mid`,
  },
  crash: {
    soft: `${CYMBALS}/Suspended Cymbal 1/susCymb1_hit_stick_f1`,
    loud: `${CYMBALS}/Suspended Cymbal 1/susCymb1_hit_stick_f1`,
  },
  ride: {
    soft: `${CYMBALS}/Suspended Cymbal 1/susCymb1_hit_stick_mp1`,
    loud: `${CYMBALS}/Suspended Cymbal 1/susCymb1_hit_stick_mp1`,
  },
  bell: {
    soft: `${CYMBALS}/Suspended Cymbal 1/susCymb1_hit_bell_mf1`,
    loud: `${CYMBALS}/Suspended Cymbal 1/susCymb1_hit_bell_mf1`,
  },
};
/** Like the piano, mp and below use the soft samples; mf and above the loud ones (see DYNAMIC_VELOCITY). */
const DRUM_LAYERS = [
  { layer: "soft", velRange: [1, LOUD_SAMPLE_VELOCITY - 1] },
  { layer: "loud", velRange: [LOUD_SAMPLE_VELOCITY, 127] },
] as const;

const sampleName = (path: string) => path.split("/").at(-1)!;

export function drumsPreset(): SmplrPreset {
  return {
    samples: { baseUrl: `${SOUNDS_BASE}/drums`, formats: SOUND_FORMATS },
    groups: DRUM_LAYERS.map(({ layer, velRange }) => ({
      velRange: [...velRange] as [number, number],
      regions: DRUM_PIECE_CODES.map((piece) => {
        const { midi } = DRUM_PIECES[piece];
        const sample = DRUM_SAMPLES[piece];
        // A sample tuned down plays from a root above the note it answers.
        return {
          sample: sampleName(sample[layer]),
          pitch: midi - (sample.semitones ?? 0),
          keyRange: [midi, midi] as [number, number],
        };
      }),
    })),
  };
}
