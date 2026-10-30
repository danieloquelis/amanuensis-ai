import { ARTICULATIONS, type Articulation } from "../domain/notation";
import type { DurationValue } from "../domain/operations/schema";
import type { Pitch } from "../domain/schema";
import { DRUM_PIECE_CODES, sortDrums, type DrumPiece } from "../domain/drums";
import { chordFrom } from "../domain/stacks";
import { DURATION_CODES } from "./score-text";

/** One written note or rest, as parsed from score text. */
export type WrittenEvent = {
  /** The lowest note; null for a rest. */
  pitch: Pitch | null;
  /** Further notes on the same stem ("<C4 E4 G4>q"), lowest first. */
  stack: Pitch[];
  /** A drum hit's pieces ("<hat kick>e"); empty for notes and rests. */
  drums: DrumPiece[];
  duration: DurationValue;
  tie: boolean;
  articulation: Articulation | null;
  opensSlur: boolean;
  closesSlur: boolean;
};
export type WrittenBar = {
  bar: number;
  /** The staff it is on, by handle ("trumpet", "piano.2"); the first staff when absent. */
  staff?: string;
  /** Which line of the staff: 1 is its main line, 2 the second voice ("bar 3 v2: …"). */
  voice: number;
  /** "bar 3 v2: -": take that voice out of the bar. */
  remove: boolean;
  /** null: a whole-bar rest ("R"). */
  events: WrittenEvent[] | null;
  chords: { symbol: string; beat: number }[];
  section: string | null;
};

/** "bar 3:", "bar 3 (6/8):", "bar 3 v2:", "bar 3 trumpet:", "bar 3 piano.2 v2:". */
const BAR_LINE = /^bar\s+(\d+)\s*(?:\([^)]*\))?(?:\s+(?!v\d\b)([a-z][\w-]*(?:\.\d)?))?(?:\s*v(\d))?\s*:(.*)$/i;
const TOKEN = /^(\(?)(?:<([^>]+)>|([A-G][#bn]?\d)|(r))([whqes])(\.?)(~?)(?:!(staccato|accent|tenuto|fermata))?(\)?)$/;
/** "n" is an explicit natural (En4 is E4): accepted, as musicians write it. */
const PITCH = /^([A-G])([#bn]?)(\d)$/;
/** A drum piece written without its brackets ("kickq"), longest names first ("hatopen" before "hat"). */
const BARE_DRUM = new RegExp(
  `^(\\(?)(${[...DRUM_PIECE_CODES].sort((a, b) => b.length - a.length).join("|")})([whqes].*)$`,
);
/** Tokens are split on spaces, except inside a chord's angle brackets. */
const TOKENS = /\(?<[^>]*>\S*|\S+/g;
const ALTERS: Record<string, -1 | 0 | 1> = { b: -1, "": 0, n: 0, "#": 1 };

/** Slips that can only mean one thing, read as meant: a trailing comma, a drum piece without its brackets. */
const forgiven = (token: string) => token.replace(/,+$/, "").replace(BARE_DRUM, "$1<$2>$3");
const DOT = 1.5;

function parseToken(token: string, bar: number): WrittenEvent {
  const match = TOKEN.exec(token);
  if (!match) throw new Error(`Bar ${bar}: "${token}" is not a note or rest (e.g. C4q, F#4e., rh).`);
  const [, open, chord, single, , code, dot, tie, articulation, close] = match;
  const base = DURATION_CODES[code as keyof typeof DURATION_CODES];
  const names = chord ? chord.trim().split(/\s+/) : single ? [single] : [];
  // Drum pieces in angle brackets are a hit ("<snare hat>e"); pitches and pieces do not mix.
  const drums = names.filter((name): name is DrumPiece => (DRUM_PIECE_CODES as readonly string[]).includes(name));
  if (drums.length && drums.length < names.length) {
    throw new Error(`Bar ${bar}: "${token}" mixes drum pieces and notes.`);
  }
  if (drums.length && tie) throw new Error(`Bar ${bar}: "${token}": a drum hit sounds once; it cannot be tied.`);
  const pitches = (drums.length ? [] : names).map((name) => {
    const note = PITCH.exec(name);
    if (!note)
      throw new Error(`Bar ${bar}: "${name}" in "${token}" is not a note (e.g. C4, F#4, Bb3) or a drum (e.g. snare).`);
    const [, step, accidental, octave] = note;
    return { step: step as Pitch["step"], alter: ALTERS[accidental], octave: Number(octave) };
  });
  const notes = pitches.length ? chordFrom(pitches) : null;
  return {
    pitch: notes?.pitch ?? null,
    stack: notes?.stack ?? [],
    drums: drums.length ? sortDrums(drums) : [],
    duration: (dot ? base * DOT : base) as DurationValue,
    tie: tie === "~",
    articulation: (ARTICULATIONS as readonly string[]).includes(articulation) ? (articulation as Articulation) : null,
    opensSlur: open === "(",
    closesSlur: close === ")",
  };
}

/** Parses "bar N: notes ; chords … ; section …" and "bar N vK: …" lines; read-only parts are ignored. */
export function parseBarsText(text: string): WrittenBar[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const match = BAR_LINE.exec(line);
    if (!match) throw new Error(`"${line.slice(0, 40)}" is not a bar line ("bar N: notes ; chords …").`);
    const bar = Number(match[1]);
    const staff = match[2]?.toLowerCase();
    const voice = match[3] ? Number(match[3]) : 1;
    const [notes, ...parts] = match[4].split(";").map((part) => part.trim());
    const tokens = notes.match(TOKENS) ?? [];
    const remove = tokens.length === 1 && tokens[0] === "-";
    if (remove && voice === 1)
      throw new Error(`Bar ${bar}: the main line cannot be removed; write R for a whole-bar rest.`);
    const written: WrittenBar = {
      bar,
      ...(staff ? { staff } : {}),
      voice,
      remove,
      events:
        remove || (tokens.length === 1 && tokens[0] === "R") ? null : tokens.map((t) => parseToken(forgiven(t), bar)),
      chords: [],
      section: null,
    };
    // A section written into the chord list ("chords F, section A") starts there, as meant.
    const separated = parts.flatMap((part) => part.split(/,?\s+(?=section\s)/));
    for (const part of separated) {
      const [word, ...rest] = part.split(/\s+/);
      if (word === "chords") {
        written.chords = rest
          .map((chord) => chord.replace(/,+$/, ""))
          .filter(Boolean)
          .map((chord) => {
            const [symbol, beat] = chord.split("@");
            return { symbol, beat: beat ? Number(beat) - 1 : 0 };
          });
      }
      if (word === "section") written.section = rest.join(" ");
    }
    return written;
  });
}
