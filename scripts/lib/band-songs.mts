// The songs the band evaluation arranges: a swing lead sheet, a D-minor waltz and the example song
// with chords. Each is built through the score's own operations, as the editor would make it.
import { readFileSync } from "node:fs";
import { applyCommand, createExample, parseScore, writeBars, type Operation, type Score } from "@/modules/score";

export type Song = { name: string; style: string; score: () => Score };

const D_MINOR = { fifths: -1, mode: "minor" } as const;
const WALTZ_TEMPO = 132;

/** The score after one operation, applied as the editor applies it. */
const apply = (score: Score, operation: Operation, requestId: string) =>
  applyCommand(score, { requestId, expectedRevision: score.revision, operation });

/** A swing lead sheet in F: melody on a piano part, with slash and repeat bars. */
const leadSheet = () => parseScore(JSON.parse(readFileSync("tests/fixtures/engraving/leadsheet.json", "utf8")));

/** Eight bars of a simple waltz in D minor: Dm Gm A7 Dm, twice. */
function waltz(): Score {
  const blank = apply(
    createExample(),
    { type: "newScore", title: "Waltz in D minor", meter: { numerator: 3, denominator: 4 }, bars: 8, key: D_MINOR },
    "waltz-new",
  );
  const timed = apply(blank, { type: "setTempo", tempo: WALTZ_TEMPO }, "waltz-tempo");
  const text = [
    "bar 1: A4q D5q F5q ; chords Dm",
    "bar 2: G5h D5q ; chords Gm",
    "bar 3: C#5h. ; chords A7",
    "bar 4: D5h. ; chords Dm",
    "bar 5: F5q E5q D5q ; chords Dm",
    "bar 6: Bb4h G4q ; chords Gm",
    "bar 7: A4q C#5q E5q ; chords A7",
    "bar 8: D5h. ; chords Dm",
  ].join("\n");
  const { command } = writeBars(timed, text, "waltz-melody");
  return applyCommand(timed, command);
}

/** The example song ("First light") with chords added: C | Dm7 | Em7 G7 | C. */
function exampleWithChords(): Score {
  const score = createExample();
  const bar = (index: number) => score.measures[index].id;
  const chords: [bar: number, beat: number, symbol: string][] = [
    [0, 0, "C"],
    [1, 0, "Dm7"],
    [2, 0, "Em7"],
    [2, 2, "G7"],
    [3, 0, "C"],
  ];
  const operations = chords.map(([index, beat, symbol]) => ({
    type: "putChord" as const,
    measureId: bar(index),
    beat,
    symbol,
  }));
  return apply(score, { type: "batch", operations }, "example-chords");
}

export const SONGS: Song[] = [
  { name: "lead sheet", style: "Swing feel.", score: leadSheet },
  { name: "waltz", style: "A gentle jazz waltz, in three.", score: waltz },
  { name: "example", style: "Pop ballad feel.", score: exampleWithChords },
];
