import { getMeasure } from "../queries";
import { beats, durationFromBeats, isSupportedDuration, measureCapacity, meterName } from "../rhythm";
import type { Measure, Meter } from "../schema";
import { detachFrom, makeGaps, makeRests, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/**
 * Changes the meter of exactly the listed bars. `preserve` keeps note durations, padding with
 * editable space or trimming trailing rests; `scale` fits the rhythm proportionally.
 * Neither policy ever cuts a note or invents tuplets.
 */
export function setMeter(draft: Draft, op: OperationOf<"setMeter">, { idPrefix }: OperationContext) {
  if (new Set(op.measureIds).size !== op.measureIds.length) {
    throw new Error("Choose each measure once.");
  }
  op.measureIds.forEach((id, index) => {
    const measure = getMeasure(draft, id);
    const capacity = measureCapacity(op.meter);
    const oldCapacity = measureCapacity(measure.meter);
    const prefix = `${idPrefix}-${index}`;
    if (measure.events.length === 1 && measure.events[0].measureRest) {
      measure.events[0].duration = durationFromBeats(capacity);
    } else if (op.policy === "scale") {
      scaleRhythm(measure, capacity / oldCapacity);
    } else if (capacity > oldCapacity) {
      measure.events.push(...makeGaps(capacity - oldCapacity, prefix));
    } else if (capacity < oldCapacity) {
      trimTrailingSpace(draft, measure, oldCapacity - capacity, op.meter, prefix);
    }
    measure.meter = { ...op.meter };
  });
}

function scaleRhythm(measure: Measure, ratio: number) {
  for (const event of measure.events) {
    const value = beats(event.duration) * ratio;
    if (!isSupportedDuration(value)) {
      throw new Error(
        "Fitting this rhythm would require unsupported tuplets. Keep durations or edit the rhythm first.",
      );
    }
    event.duration = durationFromBeats(value);
  }
}

/** Removes `excess` beats of trailing rests or space, refusing to cut a note. */
function trimTrailingSpace(draft: Draft, measure: Measure, excess: number, meter: Meter, prefix: string) {
  while (excess > 0) {
    const last = measure.events.at(-1)!;
    if (last.pitch) {
      throw new Error(
        `Changing to ${meterName(meter)} would cut notes. Choose Fit rhythm or make room with rests first.`,
      );
    }
    measure.events.pop();
    detachFrom(draft, [last.id]);
    const remainder = beats(last.duration) - excess;
    if (remainder > 0) {
      measure.events.push(...(last.gap ? makeGaps(remainder, prefix) : makeRests(remainder, prefix)));
    }
    excess = Math.max(0, -remainder);
  }
}
