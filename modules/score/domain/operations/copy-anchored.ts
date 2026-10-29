import type { Annotation, Slur } from "../schema";
import type { Draft } from "./draft";

/** Where copied things went: a copied event's first and last pieces (a note split at a barline has two). */
export type CopyMap = { first: Map<string, string>; last: Map<string, string> };

/**
 * Copies the indications on copied notes and bars (anchored to the first piece of a note) and
 * the slurs whose both ends were copied (from the first piece of the start to the last of the end).
 * `annotations` and `slurs` are the score's before the paste, so overwritten originals still count.
 */
export function copyAnchored(
  draft: Draft,
  { annotations, slurs }: { annotations: Annotation[]; slurs: Slur[] },
  map: CopyMap,
  idPrefix: string,
) {
  annotations
    .filter((a) => map.first.has(a.targetId))
    .forEach((a, index) => {
      const copy = { ...a, id: `${idPrefix}-a${index}`, targetId: map.first.get(a.targetId)! };
      draft.annotations = [
        ...draft.annotations.filter(
          (b) => !(b.targetId === copy.targetId && b.kind === "dynamic" && copy.kind === "dynamic"),
        ),
        copy,
      ];
    });
  slurs
    .filter((s) => map.first.has(s.startEventId) && map.last.has(s.endEventId))
    .forEach((s, index) => {
      draft.slurs.push({
        ...s,
        id: `${idPrefix}-s${index}`,
        startEventId: map.first.get(s.startEventId)!,
        endEventId: map.last.get(s.endEventId)!,
      });
    });
}
