// The system prompt's musical rules and the requests that test each one (for prompt-rules-eval).
// A grader looks at the score that results (and the reply where the rule is about what to say);
// it accepts any good musical answer, not one exact spelling.
import type { AssistantResult } from "@/modules/assistant";
import type { Score } from "@/modules/score";

/**
 * A rule: the prompt line that starts with `start`, and what it asks. A rule cut from the prompt
 * keeps `start: null`: its cases still run, with the prompt as it is, to catch a regression.
 */
export const RULES = {
  chordSuggest: {
    start: "- Chords that should fit the melody",
    about: "use music_suggest_chords; write named chords as said",
  },
  vocabulary: { start: "- If something isn't in the vocabulary", about: "say so instead of approximating" },
  voices: { start: "Voices: decide like a musician.", about: "when to use a second voice, and when not" },
  movingTime: {
    start: null,
    about: "shiftTime/stretchTime instead of rewriting bars (cut 1 Nov 2026: the tool descriptions say it)",
  },
  repeating: {
    start: null,
    about: "copyBars/copyNotes instead of writing notes again (cut 1 Nov 2026: the tool descriptions say it)",
  },
  chordSymbols: {
    start: null,
    about: "chord symbols vs notes on one stem (cut 1 Nov 2026: the tool descriptions say it)",
  },
  instruments: {
    start: null,
    about: "addPart; a piano's left hand is a second staff (cut 1 Nov 2026: the tool descriptions say it)",
  },
  drums: {
    start: null,
    about: "putGroove, then single bars; a fill to end (cut 1 Nov 2026: the tool descriptions say it)",
  },
  transposing: { start: 'Instruments: "play it on trumpet"', about: "setInstrument; explain written vs sounding" },
} as const satisfies Record<string, { start: string | null; about: string }>;
export type RuleName = keyof typeof RULES;

type Graded = { before: Score; after: Score; text: string; result: AssistantResult };
export type Scenario = {
  name: string;
  rule: RuleName;
  instruction: string;
  score?: () => Score;
  grade: (run: Graded) => { pass: boolean; note: string };
};

/** The notes of a bar's line in score text ("bar 2: …", or with a label, "bar 2 piano.2: …"). */
function line(text: string, bar: number, label = ""): string | null {
  const pattern = new RegExp(
    `^bar ${bar}(?: \\([^)]*\\))?${label ? ` ${label.replace(".", "\\.")}` : "(?: [a-z][\\w.]*)?"}: ([^;]*)`,
  );
  for (const row of text.split("\n")) {
    const match = pattern.exec(row);
    if (match) return match[1].trim();
  }
  return null;
}
const melody = ["C4q E4q G4q E4q", "D4q F4e G4e A4h", "G4q E4q D4q E4q", "C4w"];
/** The example's melody is still in bars 1–4 of its first line. */
const melodyKept = (text: string) =>
  melody.every((notes, i) => line(text, i + 1) === notes || line(text, i + 1, "piano") === notes);
const pitchesOf = (notes: string) => notes.match(/[A-G][#b]?\d/g) ?? [];
const chordsOf = (text: string, bar: number) =>
  (text.split("\n").find((row) => row.startsWith(`bar ${bar}:`) || row.startsWith(`bar ${bar} piano:`)) ?? "")
    .match(/chords ([^;]*)/)?.[1]
    ?.trim() ?? "";
const verdict = (pass: boolean, note: string) => ({ pass, note });

export const SCENARIOS: Scenario[] = [
  {
    name: "chords that fit",
    rule: "chordSuggest",
    instruction: "Add chords that fit the melody, one or two per bar.",
    grade: ({ text }) => {
      const missing = [1, 2, 3, 4].filter((bar) => !chordsOf(text, bar));
      return verdict(
        !missing.length && melodyKept(text),
        missing.length ? `no chords in bars ${missing}` : "chords in every bar",
      );
    },
  },
  {
    name: "named chords",
    rule: "chordSuggest",
    instruction: "Chords: C in bar 1, G7 in bar 2, Am in bar 3, C in bar 4.",
    grade: ({ text }) => {
      const got = [1, 2, 3, 4].map((bar) => chordsOf(text, bar)).join(" | ");
      return verdict(got === "C | G7 | Am | C", got);
    },
  },
  {
    name: "hairpin (not available)",
    rule: "vocabulary",
    instruction: "Add a crescendo hairpin from bar 1 to bar 2.",
    grade: ({ result, before, after }) => {
      const says = /(not|n['’]?t) (yet )?(supported|available)|can['’]?t|cannot|no hairpin/i.test(result.reply);
      const changed =
        JSON.stringify(before.measures) !== JSON.stringify(after.measures) ||
        after.annotations.length > before.annotations.length;
      return verdict(
        says && !changed,
        `${says ? "says so" : "doesn't say so"}, ${changed ? "approximated" : "left the score"}: ${result.reply}`,
      );
    },
  },
  {
    name: "bass line under the melody",
    rule: "voices",
    instruction: "Add a simple bass line under the melody in bars 1–4, half notes.",
    grade: ({ text }) => {
      const bass = [1, 2, 3, 4].map(
        (bar) => line(text, bar, "v2") ?? line(text, bar, "piano v2") ?? line(text, bar, "piano.2") ?? "",
      );
      const ok = bass.every((notes) => pitchesOf(notes).length > 0) && melodyKept(text);
      return verdict(ok, ok ? "bass written, melody kept" : `bass: ${bass.join(" | ")}`);
    },
  },
  {
    name: "one line with rests stays one voice",
    rule: "voices",
    instruction: "Rewrite bar 2 as four eighth notes D4 E4 F4 G4 and then a half rest.",
    grade: ({ text }) => {
      const bar = line(text, 2);
      const extra = /\bv2\b/.test(text);
      return verdict(bar === "D4e E4e F4e G4e rh" && !extra, `bar 2: ${bar}${extra ? ", added a second voice" : ""}`);
    },
  },
  {
    name: "twice as slow",
    rule: "movingTime",
    instruction: "Make the whole tune twice as slow by doubling every note value; keep the tempo.",
    grade: ({ before, after, text }) => {
      // Doubled values: bar 1's four quarters fill bars 1–2 as halves; the tune now takes 8 bars.
      const opening = [line(text, 1), line(text, 2)];
      const ok =
        after.measures.length >= 8 && opening.join(" | ") === "C4h E4h | G4h E4h" && after.tempo === before.tempo;
      return verdict(ok, `${after.measures.length} bars, tempo ${after.tempo}, opening: ${opening.join(" | ")}`);
    },
  },
  {
    name: "start a beat later",
    rule: "movingTime",
    instruction: "Push the whole melody one beat later, so bar 1 starts with a quarter rest.",
    grade: ({ text }) => {
      // Everything a beat later: bar 2 starts with bar 1's last quarter, then bar 2's opening.
      const opening = [line(text, 1), line(text, 2)];
      const ok = opening[0] === "rq C4q E4q G4q" && (opening[1] ?? "").startsWith("E4q D4q F4e G4e");
      return verdict(ok, `opening: ${opening.join(" | ")}`);
    },
  },
  {
    name: "repeat two bars",
    rule: "repeating",
    instruction: "Repeat bars 1–2 as bars 5–6.",
    grade: ({ text }) => {
      const ok = line(text, 5) === melody[0] && line(text, 6) === melody[1];
      return verdict(ok, `bar 5: ${line(text, 5)} | bar 6: ${line(text, 6)}`);
    },
  },
  {
    name: "chord symbols, not notes",
    rule: "chordSymbols",
    instruction: "Put chord symbols over the melody: C, Dm, G, C, one per bar.",
    grade: ({ text }) => {
      const got = [1, 2, 3, 4].map((bar) => chordsOf(text, bar)).join(" | ");
      const stacked = /</.test(
        text
          .split("\n")
          .filter((row) => row.startsWith("bar "))
          .join(" "),
      );
      return verdict(
        got === "C | Dm | G | C" && !stacked && melodyKept(text),
        `${got}${stacked ? ", wrote notes on stems" : ""}`,
      );
    },
  },
  {
    name: "a played chord on one stem",
    rule: "chordSymbols",
    instruction: "Make the last note a full C major chord the pianist plays: C4 E4 G4.",
    grade: ({ text }) => {
      const bar = line(text, 4) ?? "";
      return verdict(/^<C4 E4 G4>w/.test(bar), `bar 4: ${bar}`);
    },
  },
  {
    name: "a left hand for the piano",
    rule: "instruments",
    instruction: "Add a left hand to the piano: whole-note bass notes C3, G2, G2, C3.",
    grade: ({ after, text }) => {
      const hand = [1, 2, 3, 4].map((bar) => line(text, bar, "piano.2") ?? "").join(" | ");
      const ok = after.parts.length === 1 && after.parts[0].staves.length === 2 && hand === "C3w | G2w | G2w | C3w";
      return verdict(ok, `${after.parts.length} part(s), left hand: ${hand}`);
    },
  },
  {
    name: "rock beat with a fill",
    rule: "drums",
    instruction: "Add drums: a rock beat for all four bars, with a fill in bar 4.",
    grade: ({ after, text }) => {
      const drums = after.parts.some((part) => part.instrument === "drums");
      const bars = [1, 2, 3, 4].map((bar) => line(text, bar, "drums") ?? "");
      const ok = drums && bars.every((notes) => /</.test(notes)) && bars[3] !== bars[2];
      return verdict(ok, `${drums ? "" : "no drum part; "}bar 3: ${bars[2]} | bar 4: ${bars[3]}`);
    },
  },
  {
    name: "play it on trumpet",
    rule: "transposing",
    instruction: "Play it on trumpet.",
    grade: ({ after, text, result }) => {
      const trumpet = after.parts[0].instrument === "trumpet" && melodyKept(text);
      const explains = /written|transpos|sounds? the same|same (pitch|sound)|a (major )?(2nd|second|tone) higher/i.test(
        result.reply,
      );
      return verdict(
        trumpet && explains,
        `${trumpet ? "trumpet, same pitches" : "not switched as asked"}; reply: ${result.reply}`,
      );
    },
  },
];
