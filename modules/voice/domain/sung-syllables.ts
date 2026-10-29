import type { SpeechTurn, SungSpan } from "./take";

/** Sung syllables are short: at most this many letters ("la", "pam", "ting"). */
const SYLLABLE_LETTERS = 4;
/** Sung syllables come in runs this long or longer ("da da da"); two in a row is a stutter. */
const MIN_RUN = 3;
/** A syllable said twice or more in one word, as recognizers write quick singing: "baba", "Ba-ba-ba". */
const DOUBLED = /^(\p{L}{1,3})\1+$/u;
/** A sung syllable's shape: consonants, a vowel, and at most a hum to end ("da", "pam", "ting"; not "add"). */
const SYLLABLE = /^[^aeiouyáéíóúàèìòùäëïöü]*([aeiouyáéíóúàèìòùäëïöü]+)(?:n|m|ng)?$/u;
/** A turn this close (seconds) before a sung span may carry its syllables in its text. */
const NEAR_SINGING = 1;

const round = (seconds: number) => Math.round(seconds * 100) / 100;

/** A word as compared: lower case, letters only ("Ba-ba!" is "baba"). */
export const wordOf = (token: string) => token.toLowerCase().replace(/[^\p{L}]/gu, "");

/** The vowel at a sung syllable's heart ("da" and "ta" share "a"), or null for other words. */
const nucleus = (word: string) => (word.length <= SYLLABLE_LETTERS ? (SYLLABLE.exec(word)?.[1] ?? null) : null);

/**
 * Which words are sung syllables, the way the recognizer writes singing down: runs of three or
 * more short words in a row on one vowel ("da da da da ta ta", "pa pa pa"), or a syllable doubled
 * inside one word ("baba", "Ba-ba-ba"). Talk's repeated words ("como una como una", "esta
 * esta") are not.
 */
export function vocableMask(words: string[]): boolean[] {
  const mask = words.map((word) => DOUBLED.test(word));
  let start = 0;
  for (let i = 1; i <= words.length; i++) {
    const vowel = nucleus(words[start]);
    if (i < words.length && vowel !== null && nucleus(words[i]) === vowel) continue;
    if (i - start >= MIN_RUN) mask.fill(true, start, i);
    start = i;
  }
  return mask;
}

/** Text with the sung syllables taken out, which the recognizer wrote down as if they were words. */
export function withoutSungSyllables(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const drop = vocableMask(tokens.map(wordOf));
  return tokens
    .filter((_, i) => !drop[i])
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/**
 * What was said around the singing: a turn that runs into a sung span ends where the singing
 * starts, and loses the syllables the recognizer wrote for it. Turns left without words go.
 */
export function speechAroundSinging(speech: SpeechTurn[], sung: SungSpan[]): SpeechTurn[] {
  return speech
    .map((turn) => {
      const near = sung.filter((span) => span.start <= turn.end + NEAR_SINGING && span.end >= turn.start);
      if (!near.length) return turn;
      const starts = near.map((span) => span.start).filter((start) => start > turn.start);
      const end = round(Math.min(turn.end, ...starts));
      return { ...turn, end, text: withoutSungSyllables(turn.text) };
    })
    .filter((turn) => turn.text);
}
