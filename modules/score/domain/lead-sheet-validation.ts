import { measureCapacity } from "./rhythm";
import type { Score } from "./schema";
import type { IdRegistry } from "./validation";
import { voiceBars } from "./voice-access";

/** Chords anchor to an existing bar, inside it, and at most one per beat. */
export function validateChords(score: Score, ids: IdRegistry) {
  const positions = new Set<string>();
  for (const chord of score.chords) {
    ids.add(chord.id);
    const measure = score.measures.find((m) => m.id === chord.measureId);
    if (!measure) throw new Error("A chord needs an existing bar.");
    if (chord.beat >= measureCapacity(measure.meter)) throw new Error("A chord must start inside its bar.");
    const position = `${chord.measureId}@${chord.beat}`;
    if (positions.has(position)) throw new Error("Only one chord may start on each beat.");
    positions.add(position);
  }
}

/** Slash and repeat bars hold only a whole-bar rest; a repeat bar needs a bar before it. Marks need a bar. */
export function validateBarMarks(score: Score, ids: IdRegistry) {
  score.measures.forEach((measure, index) => {
    for (const { events, style } of voiceBars(measure)) {
      if (style && !(events.length === 1 && events[0].measureRest)) {
        throw new Error("A slash or repeat bar cannot also contain notes.");
      }
      if (style === "repeat" && index === 0) throw new Error("The first bar has nothing to repeat.");
    }
  });
  for (const mark of score.marks) {
    ids.add(mark.id);
    if (!score.measures.some((m) => m.id === mark.measureId)) throw new Error("A mark needs an existing bar.");
  }
}
