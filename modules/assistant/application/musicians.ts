import { z } from "zod";
import { INSTRUMENTS, type InstrumentId } from "@/modules/score";

/** What a part does in a band, which also sets the order the band rehearses in. */
export type BandRole = "groove" | "bass" | "harmony" | "lead";
const ROLE_ORDER: BandRole[] = ["groove", "bass", "harmony", "lead"];

/**
 * Each musician's name: short, funny and not a person's, chosen for its part once and kept for the
 * whole song (the same part always gets the same name), so "Rumble, play it again" keeps working.
 */
const NAMES: Record<InstrumentId, string[]> = {
  drums: ["Thump", "Boomer", "Snap", "Rattle"],
  bass: ["Rumble", "Lowdown", "Thud", "Walker"],
  piano: ["Ivory", "Plinky", "Hammers", "Keys"],
  guitar: ["Twang", "Strummy", "Fretz", "Pluck"],
  trumpet: ["Blaze", "Toot", "Brassy", "Sparks"],
  flute: ["Whistle", "Breezy", "Flutter", "Puff"],
  trombone: ["Slide", "Bonbon", "Wah", "Slinky"],
};

/** The name of the musician playing a part (by its handle), the same every time. */
export function musicianName(instrument: InstrumentId, part: string): string {
  const names = NAMES[instrument];
  const hash = [...part].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 7);
  return names[hash % names.length];
}

/**
 * What each instrument does in a band and what its player knows: the craft the score tools
 * cannot carry (range and clef come from INSTRUMENTS). Kept short: each musician reads only its own.
 */
const CRAFT: Record<InstrumentId, { role: BandRole; craft: string }> = {
  drums: {
    role: "groove",
    craft:
      'You keep time and set the feel. Start from putGroove when one of the grooves listed for this meter fits the style (its name exactly as listed; it writes valid bars at once); then shape it: a fill into each new section, lighter in verses, a crash on the first beat of a section. Hands are the upper voice ("bar 3 drums: <ride snare>q …"), feet the lower ("bar 3 drums v2: <kick>q …"); every hit is in <…>.',
  },
  bass: {
    role: "bass",
    craft:
      "You hold the harmony's floor and lock with the kick drum. The chord's root on beat 1, then fifths, octaves and approach notes leading into the next chord (walking in swing, roots and fifths in ballads and rock). Written an octave above its sound: write the sounding pitches.",
  },
  piano: {
    role: "harmony",
    craft:
      "You comp the chords: voicings with the 3rd and 7th, between about C3 and C5, below the melody and above the bass, in the rhythm of the style (off-beats in swing, held chords in ballads). Two staves when you need the left hand.",
  },
  guitar: {
    role: "harmony",
    craft:
      "You comp the chords: strummed or picked patterns in the style's rhythm, voicings a guitarist can play (no more than four notes, within a hand's stretch), out of the melody's way.",
  },
  trumpet: {
    role: "lead",
    craft:
      "You carry or answer the melody. Leave room to breathe (a rest every few bars), keep long notes on chord tones, stay in the middle of your range unless a peak is wanted. Written a tone above its sound: write the sounding pitches.",
  },
  flute: {
    role: "lead",
    craft:
      "You carry or decorate the melody, usually above it: light countermelodies, fills where the melody rests. Leave room to breathe.",
  },
  trombone: {
    role: "lead",
    craft:
      "You play long lines and harmony under the melody, or a bass line when there is no bass. Slides make wide fast leaps awkward: favour steps. Leave room to breathe.",
  },
};

export const roleOf = (instrument: InstrumentId): BandRole => CRAFT[instrument].role;

/** The band in rehearsal order: groove, then bass, then harmony, then the lead lines. */
export const rehearsalOrder = <T extends { instrument: InstrumentId }>(parts: T[]): T[] =>
  [...parts].sort((a, b) => ROLE_ORDER.indexOf(roleOf(a.instrument)) - ROLE_ORDER.indexOf(roleOf(b.instrument)));

/** When each role plays its first pass: the groove, then the bass on it, then harmony and lead lines together. */
const WAVE: Record<BandRole, number> = { groove: 0, bass: 1, harmony: 2, lead: 2 };

/**
 * The band's first pass in waves, in rehearsal order: each wave plays at once, hearing the waves
 * before it. Harmony and lead lines share a wave: the tune plan tells them where each goes, and
 * they hear each other in the rehearsal.
 */
export function firstPassWaves<T extends { instrument: InstrumentId }>(parts: T[]): T[][] {
  const waves: T[][] = [];
  for (const part of rehearsalOrder(parts)) (waves[WAVE[roleOf(part.instrument)]] ??= []).push(part);
  return waves.filter(Boolean);
}

const midiName = (midi: number) => {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

/** The brief a musician reads about its own instrument. */
export function craftCard(instrument: InstrumentId, name: string): string {
  const { name: instrumentName, clef, range } = INSTRUMENTS[instrument];
  return `You are ${name}, the band's ${instrumentName}. ${CRAFT[instrument].craft} Clef: ${clef}. Comfortable range ${midiName(range.low)}–${midiName(range.high)} (sounding).`;
}

/** Band Mode as a request carries it: on, the agent leads a band of musicians it puts together itself. */
export const bandSchema = z.strictObject({ on: z.boolean() });
