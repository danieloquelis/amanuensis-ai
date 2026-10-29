import type { SpeechTurn, SungSpan } from "./take";

/** Sung syllables are short: at most this many letters ("la", "pam", "ping"). */
const SYLLABLE_LETTERS = 4;
/** A syllable repeated this many times, or two alternating, is singing ("ping ping ping"). */
const MIN_RUN = 3;
/** A turn this close (seconds) before a sung span may carry its syllables in its text. */
const NEAR_SINGING = 1;

const wordOf = (token: string) => token.toLowerCase().replace(/[^\p{L}]/gu, "");
const isSyllable = (word: string) => word.length > 0 && word.length <= SYLLABLE_LETTERS;

/** Which words are sung syllables: runs of a short syllable repeated, or two alternating. */
function syllableMask(words: string[]): boolean[] {
  const drop = new Array(words.length).fill(false);
  // A run continues while each syllable repeats the one a period back (1: "la la", 2: "pam pim").
  for (const period of [1, 2]) {
    let start = 0;
    for (let i = 1; i <= words.length; i++) {
      const repeats = i - start < period || words[i] === words[i - period];
      if (i < words.length && isSyllable(words[i]) && repeats) continue;
      if (i - start >= MIN_RUN && isSyllable(words[start])) drop.fill(true, start, i);
      start = i;
    }
  }
  return drop;
}

/**
 * Text with the sung syllables taken out: runs of a short syllable repeated ("la la la") or two
 * alternating ("pam pim pam pim"), which the recognizer writes down as if they were words.
 */
export function withoutSungSyllables(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const drop = syllableMask(tokens.map(wordOf));
  return tokens
    .filter((_, i) => !drop[i])
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/**
 * A text that ends in sung syllables ("…gonna add da da da da da"): how many syllables the
 * closing run has, and how much of the text, by letters, it takes up (1 when the whole text is
 * syllables). Null when it ends in words.
 */
export function closingSyllables(text: string): { count: number; share: number } | null {
  const words = text.split(/\s+/).filter(Boolean).map(wordOf);
  const sung = syllableMask(words);
  let start = words.length;
  // Punctuation on its own ("da da da .") belongs with the run.
  while (start > 0 && (sung[start - 1] || !words[start - 1])) start--;
  if (!sung.slice(start).some(Boolean)) return null;
  const letters = (list: string[]) => list.reduce((sum, word) => sum + word.length + 1, 0);
  return { count: sung.filter(Boolean).length, share: letters(words.slice(start)) / letters(words) };
}

/** Speech turns that run into singing, with the sung syllables removed from their text. */
export function cleanTurnsBeforeSinging(raw: SpeechTurn[], turns: SpeechTurn[], sung: SungSpan[]): SpeechTurn[] {
  return turns.map((turn, i) => {
    const reaches = sung.some((span) => span.start >= turn.start && span.start <= raw[i].end + NEAR_SINGING);
    return reaches ? { ...turn, text: withoutSungSyllables(turn.text) } : turn;
  });
}
