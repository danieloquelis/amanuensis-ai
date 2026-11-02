// What the composition evaluation asks Band Mode for: pieces from scratch and arrangements of a
// tune, in styles that keep the rules of counterpoint and styles that do not.
import { applyCommand, createExample, type Score } from "@/modules/score";
import { SONGS } from "./band-songs.mjs";

export type ComposeRequest = {
  name: string;
  instruction: string;
  /** Whether the style keeps the rules of counterpoint (no parallel fifths, independent voices). */
  counterpoint: boolean;
  score: () => Score;
};

/** An empty song, as a new one starts. */
function blank(): Score {
  const score = createExample();
  return applyCommand(score, {
    requestId: "blank",
    expectedRevision: score.revision,
    operation: { type: "newScore", title: "Untitled", bars: 4 },
  });
}

const song = (name: string) => SONGS.find((s) => s.name === name)!.score;

export const REQUESTS: ComposeRequest[] = [
  {
    name: "fugue",
    instruction:
      "Compose a fugue in D minor for string quintet: two violins, viola, cello and double bass. About 24 bars.",
    counterpoint: true,
    score: blank,
  },
  {
    name: "jazz ballad",
    instruction:
      "Write a 16-bar jazz ballad for trumpet, piano, double bass and drums: a real melody on the trumpet, the piano answering it.",
    counterpoint: false,
    score: blank,
  },
  {
    name: "cinematic",
    instruction:
      "Write a cinematic piece for strings (violin, viola, cello, double bass) and piano that starts very quietly and builds to a big climax. About 24 bars.",
    counterpoint: false,
    score: blank,
  },
  {
    name: "quartet waltz",
    instruction:
      "Arrange this waltz for string quartet: two violins, viola and cello. You decide how the tune moves through the quartet.",
    counterpoint: true,
    score: song("waltz"),
  },
  {
    name: "pop band",
    instruction:
      "Arrange this for my band: drums, bass, piano and trumpet. Pop ballad feel. You decide how the tune moves through the band.",
    counterpoint: false,
    score: song("example"),
  },
];
