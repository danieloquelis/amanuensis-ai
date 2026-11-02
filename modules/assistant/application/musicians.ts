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
  violin: ["Fiddles", "Rosin", "Sparrow", "Vibrato"],
  viola: ["Middy", "Mellow", "Altie", "Velvet"],
  cello: ["Cellophane", "Bowie", "Honey", "Groan"],
  doublebass: ["Bigfoot", "Plonk", "Woody", "Thumper"],
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
      'You keep time and set the feel. Start from putGroove when one of the grooves listed for this meter fits the style (its name exactly as listed; it writes valid bars at once); then shape it: a fill into each new section, lighter in quiet sections, a crash on the first beat of a section, hits with the band\'s accents. Hands are the upper voice ("bar 3 drums: <ride snare>q …"), feet the lower ("bar 3 drums v2: <kick>q …"); every hit is in <…>. In styles without drums (baroque, classical chamber music), play nothing unless your brief asks.',
  },
  bass: {
    role: "bass",
    craft:
      "Bass guitar: you hold the harmony's floor and lock with the kick drum: the chord's root where it changes, then fifths, octaves and approach notes leading into the next chord, in the style's rhythm. Written an octave above its sound: write the sounding pitches.",
  },
  piano: {
    role: "harmony",
    craft:
      "Piano: harmony, melody and bass at once, over two staves when you need the left hand. Voicings spread between the hands with the 3rd and 7th, clear of the melody's register (nothing muddy below C3 but the bass); a figure in the style (broken chords, an ostinato, a montuno, comping stabs) rather than only block chords; your left hand carries the bass when there is no bass player.",
  },
  guitar: {
    role: "harmony",
    craft:
      "Guitar: chords in voicings a guitarist can play (no more than four notes, within a hand's stretch), strummed or picked in the style's rhythm, or a single-line riff; out of the melody's way.",
  },
  trumpet: {
    role: "lead",
    craft:
      "Trumpet: a brilliant singing lead or an answering line. Breathe (a rest every few bars), long notes on chord tones, high notes only for peaks. Written a tone above its sound: write the sounding pitches.",
  },
  flute: {
    role: "lead",
    craft:
      "Flute: a light, agile line: the melody, a countermelody above it, or decoration where the melody rests. Breathe.",
  },
  trombone: {
    role: "lead",
    craft:
      "Trombone: warm lines in the tenor register: harmony under the melody, a countermelody, or a bass line when there is no bass. The slide makes fast wide leaps awkward: favour steps. Breathe.",
  },
  violin: {
    role: "lead",
    craft:
      "Violin: lyrical bowed lines over a wide range (G3 up): the melody, a soaring countermelody, an inner voice, or agile figures; double stops sparingly. You never need to breathe, but phrase as if you did.",
  },
  viola: {
    role: "harmony",
    craft:
      "Viola: the warm middle voice (C3 to about E5): inner harmony as moving lines, not only held notes, countermelodies, and the theme when it comes to you. Alto clef: write the sounding pitches.",
  },
  cello: {
    role: "lead",
    craft:
      "Cello: the singing tenor and the bass (C2 up): a countermelody, the theme an octave down, or the bass line when there is no double bass; rich on the low strings, expressive high up.",
  },
  doublebass: {
    role: "bass",
    craft:
      "Double bass: the foundation, an octave under the cello or alone: bowed (arco) for long notes and lines, plucked (pizz.) for walking and light grooves, as the style asks. Written an octave above its sound: write the sounding pitches.",
  },
};

export const roleOf = (instrument: InstrumentId): BandRole => CRAFT[instrument].role;

/** The band in rehearsal order: groove, then bass, then harmony, then the lead lines. */
export const rehearsalOrder = <T extends { instrument: InstrumentId }>(parts: T[]): T[] =>
  [...parts].sort((a, b) => ROLE_ORDER.indexOf(roleOf(a.instrument)) - ROLE_ORDER.indexOf(roleOf(b.instrument)));

/**
 * The band's first pass, against the clock: everyone at once, in rehearsal order. They share the
 * form, the material and the tune plan; the rehearsal that always follows fits them together.
 */
export function firstPassWaves<T extends { instrument: InstrumentId }>(parts: T[]): T[][] {
  return parts.length ? [rehearsalOrder(parts)] : [];
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
