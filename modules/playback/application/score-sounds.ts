import type { Score } from "@/modules/score";
import type { SoundId } from "./sound-port";

/** The sounds a score needs: each part's instrument, and the piano that plays chord symbols. */
export function scoreSounds(score: Score): SoundId[] {
  const sounds = new Set<SoundId>(score.parts.map((part) => part.instrument));
  if (score.chords.length) sounds.add("piano");
  return [...sounds];
}
