import { z } from "zod";
import { INSTRUMENT_IDS, INSTRUMENTS, type InstrumentId } from "@/modules/score";

/** What a part does in a band, which also sets the order the band rehearses in. */
export type BandRole = "groove" | "bass" | "harmony" | "lead";
const ROLE_ORDER: BandRole[] = ["groove", "bass", "harmony", "lead"];

/** One of the musician's band, as they told it: an instrument, and who plays it. */
export type BandMember = { instrument: InstrumentId; name?: string; note?: string };

/**
 * What each instrument does in a band and what its player knows: the craft the score tools
 * cannot carry (range and clef come from INSTRUMENTS). Kept short: each musician reads only its own.
 */
const CRAFT: Record<InstrumentId, { role: BandRole; craft: string }> = {
  drums: {
    role: "groove",
    craft:
      'You keep time and set the feel. Start from putGroove when a named groove fits the meter and style; then shape it: a fill into each new section, lighter in verses, a crash on the first beat of a section. Hands are the upper voice ("bar 3 drums: <ride snare>q …"), feet the lower ("bar 3 drums v2: <kick>q …"); every hit is in <…>.',
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

const midiName = (midi: number) => {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

/** The brief a musician reads about its own instrument, and its player when the musician named them. */
export function craftCard(instrument: InstrumentId, member?: BandMember): string {
  const { name, clef, range } = INSTRUMENTS[instrument];
  const player = member?.name ? ` Your player is ${member.name}${member.note ? `: ${member.note}` : ""}.` : "";
  const note = !member?.name && member?.note ? ` The musician says: ${member.note}.` : "";
  return `You are the band's ${name}. ${CRAFT[instrument].craft} Clef: ${clef}. Comfortable range ${midiName(range.low)}–${midiName(range.high)} (sounding).${player}${note}`;
}

/** Band Mode as a request carries it: whether it is on, and the band as the musician described it. */
export const bandSchema = z.strictObject({
  on: z.boolean(),
  members: z
    .array(
      z.strictObject({
        instrument: z.enum(INSTRUMENT_IDS),
        name: z.string().trim().max(40).optional(),
        note: z.string().trim().max(160).optional(),
      }),
    )
    .max(8),
});
