import { CLEF_NAMES } from "@/modules/engraving";
import { allStaves, keyName, scoreKey, transpositionOf, writtenKey, type Score } from "@/modules/score";

/** The clef and key the sheet shows, as read aloud: "treble clef, F major" (the written key of a transposing part). */
export function sheetHeading(score: Score): string {
  const t = transpositionOf(score.parts[0].instrument);
  const key = t ? writtenKey(scoreKey(score), t) : scoreKey(score);
  return `${CLEF_NAMES[allStaves(score)[0].clef]} clef, ${keyName(key)}`;
}
