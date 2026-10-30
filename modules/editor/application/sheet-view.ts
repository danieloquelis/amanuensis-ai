import { CLEF_NAMES } from "@/modules/engraving";
import {
  allStaves,
  isDrumKit,
  keyName,
  scoreKey,
  transpositionOf,
  voiceBars,
  voiceInfo,
  writtenKey,
  type Score,
} from "@/modules/score";

/**
 * What the sheet shows, as read aloud: "treble clef, F major" (the written key of a transposing
 * part); with several parts, the parts and the concert key: "Trumpet in B♭ and Piano, F major".
 */
export function sheetHeading(score: Score): string {
  if (score.parts.length > 1) {
    const names = score.parts.map((part) => part.name).join(", ");
    return `${names.replace(/, ([^,]+)$/, " and $1")}, ${keyName(scoreKey(score))}`;
  }
  if (isDrumKit(score.parts[0].instrument)) return "Drums, percussion clef";
  const t = transpositionOf(score.parts[0].instrument);
  const key = t ? writtenKey(scoreKey(score), t) : scoreKey(score);
  return `${CLEF_NAMES[allStaves(score)[0].clef]} clef, ${keyName(key)}`;
}

/** With several parts, each event's part name, so a note reads "Trumpet in B♭, bar 1, …"; empty with one. */
export function eventPartNames(score: Score): Map<string, string> {
  const names = new Map<string, string>();
  if (score.parts.length < 2) return names;
  for (const measure of score.measures)
    for (const bar of voiceBars(measure)) {
      const { name } = voiceInfo(score, bar.voiceId)!.part;
      for (const event of bar.events) names.set(event.id, name);
    }
  return names;
}

/** With several staves, a name for each staff's lane: "Trumpet in B♭", "Piano, lower staff"; empty with one. */
export function laneNames(score: Score): Map<string, string> {
  const names = new Map<string, string>();
  if (allStaves(score).length < 2) return names;
  for (const part of score.parts)
    part.staves.forEach((staff, index) =>
      names.set(staff.id, part.staves.length > 1 ? `${part.name}, ${index ? "lower" : "upper"} staff` : part.name),
    );
  return names;
}
