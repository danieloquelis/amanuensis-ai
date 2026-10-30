// Grading for the sheet reading evaluation: a page's known score, as the page shows it, against
// what the model read from it. Pitches are compared as written (a B♭ trumpet part shows a tone
// higher than it sounds), which is what the model is asked to copy.
import {
  allStaves,
  eventOnsets,
  eventPitches,
  formatChord,
  parseBarsText,
  parseChordSymbol,
  pitchText,
  scoreKey,
  soundingBeats,
  staffHandle,
  toWritten,
  transpositionOf,
  voiceBars,
  voiceInfo,
  writtenKey,
  type Pitch,
  type Score,
} from "@/modules/score";

/** One note, chord, drum hit or rest of a line, at its place in the bar. */
type Note = { onset: number; sound: string; beats: number };
/** Every line of the score (bar, staff, voice), keyed "3|piano.2|2". */
type Lines = Map<string, Note[]>;

const EPSILON = 0.01;
const lineKey = (bar: number, staff: string, voice: number) => `${bar}|${staff}|${voice}`;
const soundOf = (pitches: Pitch[], drums: readonly string[] = []) =>
  drums.length ? [...drums].sort().join("+") : pitches.map(pitchText).sort().join("+");

/** The score's lines as its page shows them: written pitches, staves named by handle when there are several. */
export function truthLines(score: Score): Lines {
  const named = allStaves(score).length > 1;
  const lines: Lines = new Map();
  score.measures.forEach((measure, index) => {
    for (const bar of voiceBars(measure)) {
      const { part, staff, voiceIndex } = voiceInfo(score, bar.voiceId)!;
      const t = transpositionOf(part.instrument);
      const written = (p: Pitch) => (t ? toWritten(p, t, scoreKey(score)) : p);
      const onsets = eventOnsets(bar.events);
      const notes = bar.events.map((event, k) => ({
        onset: onsets[k],
        sound: soundOf(eventPitches(event).map(written), event.drums),
        beats: soundingBeats(event),
      }));
      lines.set(lineKey(index + 1, named ? staffHandle(score, staff.id)! : "", voiceIndex + 1), notes);
    }
  });
  return lines;
}

/** The bar lines of a reply, each parsed on its own; header lines and lines that do not parse are skipped. */
function readBars(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^bar\s+\d+/i.test(line))
    .flatMap((line) => {
      try {
        return parseBarsText(line);
      } catch {
        return [];
      }
    });
}

/** The lines the model wrote, from its score text. With `oneStaff`, a staff name it gave its only staff is ignored. */
export function readLines(text: string, oneStaff = false): Lines {
  const lines: Lines = new Map();
  for (const bar of readBars(text)) {
    if (oneStaff) delete bar.staff;
    let at = 0;
    // "R", a whole-bar rest, has no written length: it is one rest filling the bar.
    if (!bar.events) {
      lines.set(lineKey(bar.bar, bar.staff ?? "", bar.voice), [{ onset: 0, sound: "", beats: 0 }]);
      continue;
    }
    const notes = bar.events.map((event) => {
      const note = {
        onset: at,
        sound: soundOf(event.pitch ? [event.pitch, ...event.stack] : [], event.drums),
        beats: event.duration,
      };
      at += event.duration;
      return note;
    });
    lines.set(lineKey(bar.bar, bar.staff ?? "", bar.voice), notes);
  }
  return lines;
}

/** The key signature on the first staff, in sharps (positive) or flats (negative); none on a drum staff. */
export function pageFifths(score: Score): number {
  const t = transpositionOf(score.parts[0].instrument);
  if (score.parts[0].instrument === "drums") return 0;
  return (t ? writtenKey(scoreKey(score), t) : scoreKey(score)).fifths;
}

const chordKey = (symbol: string) => {
  const chord = parseChordSymbol(symbol.replace(/♯/g, "#").replace(/♭/g, "b"));
  return chord ? formatChord(chord) : symbol;
};

/** Chord symbols per bar, as "C@0 Am7@2". */
export function truthChords(score: Score): Map<number, string> {
  return new Map(
    score.measures.map((m, i) => [
      i + 1,
      score.chords
        .filter((c) => c.measureId === m.id)
        .sort((a, b) => a.beat - b.beat)
        .map((c) => `${formatChord(c)}@${c.beat}`)
        .join(" "),
    ]),
  );
}

export function readChords(text: string): Map<number, string> {
  const chords = new Map<number, string>();
  for (const bar of readBars(text)) {
    if (!bar.chords.length) continue;
    chords.set(bar.bar, bar.chords.map((c) => `${chordKey(c.symbol)}@${c.beat}`).join(" "));
  }
  return chords;
}

export type Grade = {
  /** Notes, chords and drum hits on the page (rests not counted). */
  notes: number;
  /** Read at the right place with the right pitch (or pieces). */
  pitch: number;
  /** …and the right length too. */
  exact: number;
  /** Lines whose rhythm (every onset and length, rests included) is exactly right. */
  rhythmLines: number;
  lines: number;
  /** Bars whose chord symbols are exactly right, of the bars that have any. */
  chordBars: number;
  chordTotal: number;
};

export function grade(
  truth: Lines,
  read: Lines,
  truthChordMap: Map<number, string>,
  readChordMap: Map<number, string>,
): Grade {
  const g: Grade = { notes: 0, pitch: 0, exact: 0, rhythmLines: 0, lines: truth.size, chordBars: 0, chordTotal: 0 };
  for (const [key, notes] of truth) {
    const mine = read.get(key) ?? [];
    for (const note of notes.filter((n) => n.sound)) {
      g.notes++;
      const match = mine.find((m) => Math.abs(m.onset - note.onset) < EPSILON && m.sound === note.sound);
      if (match) g.pitch++;
      if (match && Math.abs(match.beats - note.beats) < EPSILON) g.exact++;
    }
    const rhythm = (list: Note[]) =>
      list.length === 1 && !list[0].sound
        ? "rest"
        : list.map((n) => `${n.onset.toFixed(2)}:${n.beats.toFixed(2)}:${n.sound ? "n" : "r"}`).join(" ");
    if (rhythm(notes) === rhythm(mine)) g.rhythmLines++;
  }
  for (const [bar, chords] of truthChordMap) {
    if (!chords) continue;
    g.chordTotal++;
    if (readChordMap.get(bar) === chords) g.chordBars++;
  }
  return g;
}
