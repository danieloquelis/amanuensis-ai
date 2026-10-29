import { ARTICULATIONS, type Articulation } from "../domain/notation";
import type { DurationValue } from "../domain/operations/schema";
import type { Pitch } from "../domain/schema";
import { chordFrom } from "../domain/stacks";
import { DURATION_CODES } from "./score-text";

/** One written note or rest, as parsed from score text. */
export type WrittenEvent = {
  /** The lowest note; null for a rest. */
  pitch: Pitch | null;
  /** Further notes on the same stem ("<C4 E4 G4>q"), lowest first. */
  stack: Pitch[];
  duration: DurationValue;
  tie: boolean;
  articulation: Articulation | null;
  opensSlur: boolean;
  closesSlur: boolean;
};
export type WrittenBar = {
  bar: number;
  /** Which line of the bar: 1 is the main line, 2 the second voice ("bar 3 v2: …"). */
  voice: number;
  /** "bar 3 v2: -": take that voice out of the bar. */
  remove: boolean;
  /** null: a whole-bar rest ("R"). */
  events: WrittenEvent[] | null;
  chords: { symbol: string; beat: number }[];
  section: string | null;
};

/** "bar 3:", "bar 3 (6/8):", "bar 3 v2:". */
const BAR_LINE = /^bar\s+(\d+)\s*(?:\([^)]*\))?(?:\s*v(\d))?\s*:(.*)$/i;
const TOKEN = /^(\(?)(?:<([^>]+)>|([A-G][#b]?\d)|(r))([whqes])(\.?)(~?)(?:!(staccato|accent|tenuto|fermata))?(\)?)$/;
const PITCH = /^([A-G])([#b]?)(\d)$/;
/** Tokens are split on spaces, except inside a chord's angle brackets. */
const TOKENS = /\(?<[^>]*>\S*|\S+/g;
const ALTERS: Record<string, -1 | 0 | 1> = { b: -1, "": 0, "#": 1 };
const DOT = 1.5;

function parseToken(token: string, bar: number): WrittenEvent {
  const match = TOKEN.exec(token);
  if (!match) throw new Error(`Bar ${bar}: "${token}" is not a note or rest (e.g. C4q, F#4e., rh).`);
  const [, open, chord, single, , code, dot, tie, articulation, close] = match;
  const base = DURATION_CODES[code as keyof typeof DURATION_CODES];
  const names = chord ? chord.trim().split(/\s+/) : single ? [single] : [];
  const pitches = names.map((name) => {
    const note = PITCH.exec(name);
    if (!note) throw new Error(`Bar ${bar}: "${name}" in "${token}" is not a note (e.g. C4, F#4, Bb3).`);
    const [, step, accidental, octave] = note;
    return { step: step as Pitch["step"], alter: ALTERS[accidental], octave: Number(octave) };
  });
  const notes = pitches.length ? chordFrom(pitches) : null;
  return {
    pitch: notes?.pitch ?? null,
    stack: notes?.stack ?? [],
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
    const voice = match[2] ? Number(match[2]) : 1;
    const [notes, ...parts] = match[3].split(";").map((part) => part.trim());
    const tokens = notes.match(TOKENS) ?? [];
    const remove = tokens.length === 1 && tokens[0] === "-";
    if (remove && voice === 1)
      throw new Error(`Bar ${bar}: the main line cannot be removed; write R for a whole-bar rest.`);
    const written: WrittenBar = {
      bar,
      voice,
      remove,
      events: remove || (tokens.length === 1 && tokens[0] === "R") ? null : tokens.map((t) => parseToken(t, bar)),
      chords: [],
      section: null,
    };
    for (const part of parts) {
      const [word, ...rest] = part.split(/\s+/);
      if (word === "chords") {
        written.chords = rest.map((chord) => {
          const [symbol, beat] = chord.split("@");
          return { symbol, beat: beat ? Number(beat) - 1 : 0 };
        });
      }
      if (word === "section") written.section = rest.join(" ");
    }
    return written;
  });
}
