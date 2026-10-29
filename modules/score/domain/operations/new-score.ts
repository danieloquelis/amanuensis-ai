import type { Meter } from "../schema";
import { fullMeasureRest, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** What a blank score starts with when the operation does not say otherwise. */
export const NEW_SCORE_DEFAULTS = {
  title: "Untitled",
  bars: 4,
  tempo: 100,
  meter: { numerator: 4, denominator: 4 } satisfies Meter,
};

/**
 * Replaces the whole score with a blank one: empty bars, no chords, marks, repeats, slurs or
 * indications. It gets a new identity, since it is a different piece.
 */
export function newScore(draft: Draft, op: OperationOf<"newScore">, { idPrefix }: OperationContext) {
  const meter = op.meter ?? NEW_SCORE_DEFAULTS.meter;
  const bars = op.bars ?? NEW_SCORE_DEFAULTS.bars;
  draft.id = `${idPrefix}-score`;
  draft.title = op.title ?? NEW_SCORE_DEFAULTS.title;
  draft.tempo = op.tempo ?? NEW_SCORE_DEFAULTS.tempo;
  if (op.key) draft.key = { ...op.key };
  else delete draft.key;
  draft.measures = Array.from({ length: bars }, (_, index) => {
    const id = `${idPrefix}-bar-${index + 1}`;
    return { id, meter: { ...meter }, events: fullMeasureRest(meter, id) };
  });
  draft.annotations = [];
  draft.repeats = [];
  draft.chords = [];
  draft.marks = [];
  draft.slurs = [];
}
