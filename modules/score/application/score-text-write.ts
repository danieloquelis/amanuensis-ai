import { ARTICULATIONS, type Articulation } from "../domain/notation";
import { applyCommand } from "../domain/operations/apply-command";
import type { BasicOperation, Command, DurationValue } from "../domain/operations/schema";
import { spellRhythm } from "../domain/rhythm-spelling";
import type { Meter, Pitch, Score } from "../domain/schema";
import { DURATION_CODES } from "./score-text";

/** One written note or rest, as parsed from score text. */
type WrittenEvent = {
  pitch: Pitch | null;
  duration: DurationValue;
  tie: boolean;
  articulation: Articulation | null;
  opensSlur: boolean;
  closesSlur: boolean;
};
type WrittenBar = {
  bar: number;
  /** null: a whole-bar rest ("R"). */
  events: WrittenEvent[] | null;
  chords: { symbol: string; beat: number }[];
  section: string | null;
};

const BAR_LINE = /^bar\s+(\d+)\s*(?:\([^)]*\))?\s*:(.*)$/i;
const TOKEN = /^(\(?)(?:([A-G])([#b]?)(\d)|(r))([whqes])(\.?)(~?)(?:!(staccato|accent|tenuto|fermata))?(\)?)$/;
const ALTERS: Record<string, -1 | 0 | 1> = { b: -1, "": 0, "#": 1 };
const DOT = 1.5;

function parseToken(token: string, bar: number): WrittenEvent {
  const match = TOKEN.exec(token);
  if (!match) throw new Error(`Bar ${bar}: "${token}" is not a note or rest (e.g. C4q, F#4e., rh).`);
  const [, open, step, accidental, octave, , code, dot, tie, articulation, close] = match;
  const base = DURATION_CODES[code as keyof typeof DURATION_CODES];
  return {
    pitch: step ? { step: step as Pitch["step"], alter: ALTERS[accidental], octave: Number(octave) } : null,
    duration: (dot ? base * DOT : base) as DurationValue,
    tie: tie === "~",
    articulation: (ARTICULATIONS as readonly string[]).includes(articulation) ? (articulation as Articulation) : null,
    opensSlur: open === "(",
    closesSlur: close === ")",
  };
}

/** Parses "bar N: notes ; chords … ; section …" lines; read-only parts are ignored. */
export function parseBarsText(text: string): WrittenBar[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const match = BAR_LINE.exec(line);
    if (!match) throw new Error(`"${line.slice(0, 40)}" is not a bar line ("bar N: notes ; chords …").`);
    const bar = Number(match[1]);
    const [notes, ...parts] = match[2].split(";").map((part) => part.trim());
    const tokens = notes.split(/\s+/).filter(Boolean);
    const written: WrittenBar = {
      bar,
      events: tokens.length === 1 && tokens[0] === "R" ? null : tokens.map((t) => parseToken(t, bar)),
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

/**
 * A bar's values spelled as a musician would at their place in it (see `spellRhythm`): "C4h"
 * from the off-beat of 1 becomes "C4q.~ C4e". A split note keeps its articulation and slur start
 * on its first part, its slur end and its own tie on its last.
 */
function spelled(events: WrittenEvent[], meter: Meter): WrittenEvent[] {
  let at = 0;
  return events.flatMap((event) => {
    const parts = spellRhythm(at, event.duration, meter, event.pitch === null);
    at += event.duration;
    return parts.map((duration, k) => {
      const [first, last] = [k === 0, k === parts.length - 1];
      return {
        ...event,
        duration: duration as DurationValue,
        tie: event.pitch !== null && (last ? event.tie : true),
        articulation: first ? event.articulation : null,
        opensSlur: first && event.opensSlur,
        closesSlur: last && event.closesSlur,
      };
    });
  });
}

/**
 * IDs that operation `index` of a command creates: `apply-command` gives each operation the prefix
 * "<requestId>-<index>", and bars and notes take it as below. Lets one batch refer to notes it writes.
 */
const createdBarId = (requestId: string, index: number) => `${requestId}-${index}-bar`;
const createdNoteId = (requestId: string, index: number, note: number) => `${requestId}-${index}-n${note}`;

/**
 * Writes whole bars given as score text: each listed bar is replaced by what its line says
 * (notes, ties, slurs, articulations, chords, section), each value spelled as a musician would at
 * its place in the bar; bars past the end are added. One command, so one undo step; it is
 * validated like any edit.
 */
export function writeBars(score: Score, text: string, requestId: string): { score: Score; command: Command } {
  const bars = parseBarsText(text);
  if (!bars.length) throw new Error('Write at least one bar line ("bar N: notes").');
  const operations: BasicOperation[] = [];
  const measureIds = score.measures.map((m) => m.id);
  const missing = Math.max(0, ...bars.map((b) => b.bar)) - score.measures.length;
  for (let i = 0; i < missing; i++) {
    measureIds.push(createdBarId(requestId, operations.length));
    operations.push({ type: "appendMeasure" });
  }
  const written: (WrittenEvent & { id: string })[] = [];
  for (const { bar, events, chords, section } of bars) {
    const measureId = measureIds[bar - 1];
    if (!measureId) throw new Error(`There is no bar ${bar}.`);
    const index = operations.length;
    if (events) {
      // Bars added at the end take the last bar's meter.
      const meter = (score.measures[bar - 1] ?? score.measures.at(-1)!).meter;
      const parts = spelled(events, meter);
      const notes = parts.map(({ pitch, duration, tie }) => ({ pitch, duration, tie }));
      operations.push({ type: "replaceMeasure", measureId, events: notes });
      parts.forEach((event, k) => written.push({ ...event, id: createdNoteId(requestId, index, k) }));
    } else {
      operations.push({ type: "clearMeasure", measureId });
    }
    for (const chord of score.chords.filter((c) => c.measureId === measureId)) {
      operations.push({ type: "removeNotation", id: chord.id });
    }
    for (const chord of chords)
      operations.push({ type: "putChord", measureId, beat: chord.beat, symbol: chord.symbol });
    const hadSection = !!score.measures.find((m) => m.id === measureId)?.section;
    if (section || hadSection) operations.push({ type: "setSection", measureId, label: section });
  }
  let open: string | null = null;
  for (const event of written) {
    if (event.articulation)
      operations.push({ type: "setArticulation", eventId: event.id, articulation: event.articulation });
    if (event.opensSlur) open = event.id;
    if (event.closesSlur && open) operations.push({ type: "putSlur", startEventId: open, endEventId: event.id });
    if (event.closesSlur) open = null;
  }
  const command: Command = { requestId, expectedRevision: score.revision, operation: { type: "batch", operations } };
  return { score: applyCommand(score, command), command };
}
