import { getMeasure } from "../queries";
import { beats, durationFromBeats, isSupportedDuration, measureCapacity, meterName } from "../rhythm";
import type { Measure, Meter, ScoreEvent } from "../schema";
import { detachFrom, type Draft, type OperationContext } from "./draft";
import { makeRests, onsetOf } from "./rests";
import type { OperationOf } from "./schema";

type FitPolicy = "preserve" | "scale";

/**
 * Changes the meter of the listed bars (and, with `extend`, of the following bars that share
 * the first bar's meter, up to the next change). `preserve` keeps note durations, padding with
 * rests or trimming trailing rests; `scale` fits the rhythm proportionally; `auto` preserves when
 * the notes fit and scales otherwise. No policy ever cuts a note or invents tuplets.
 */
export function setMeter(draft: Draft, op: OperationOf<"setMeter">, { idPrefix }: OperationContext) {
  if (new Set(op.measureIds).size !== op.measureIds.length) throw new Error("Choose each measure once.");
  const policies: FitPolicy[] = op.policy === "auto" ? ["preserve", "scale"] : [op.policy];
  targetMeasures(draft, op).forEach((measure, index) => {
    const prefix = `${idPrefix}-${index}`;
    let fitted: { events: ScoreEvent[]; removedIds: string[] } | null = null;
    let failure: unknown;
    for (const policy of policies) {
      try {
        fitted = fitMeasure(measure, op.meter, policy, prefix);
        break;
      } catch (error) {
        failure = error;
      }
    }
    if (!fitted) throw failure;
    measure.events = fitted.events;
    detachFrom(draft, fitted.removedIds);
    measure.meter = { ...op.meter };
  });
}

function targetMeasures(draft: Draft, op: OperationOf<"setMeter">): Measure[] {
  const measures = op.measureIds.map((id) => getMeasure(draft, id));
  if (!op.extend) return measures;
  const original = meterName(measures[0].meter);
  let index = draft.measures.indexOf(measures[measures.length - 1]) + 1;
  while (index < draft.measures.length && meterName(draft.measures[index].meter) === original) {
    if (!measures.includes(draft.measures[index])) measures.push(draft.measures[index]);
    index++;
  }
  return measures;
}

/** Fits a bar's events to a new meter without touching the draft; throws when it can't. */
function fitMeasure(measure: Measure, meter: Meter, policy: FitPolicy, prefix: string) {
  const events = structuredClone(measure.events);
  const capacity = measureCapacity(meter);
  const oldCapacity = measureCapacity(measure.meter);
  if (events.length === 1 && events[0].measureRest) {
    events[0].duration = durationFromBeats(capacity);
    return { events, removedIds: [] };
  }
  if (policy === "scale") return { events: scaleRhythm(events, capacity / oldCapacity), removedIds: [] };
  if (capacity > oldCapacity) {
    return { events: [...events, ...makeRests(capacity - oldCapacity, prefix, oldCapacity, meter)], removedIds: [] };
  }
  return trimTrailingRests({ ...measure, events }, oldCapacity - capacity, meter, prefix);
}

function scaleRhythm(events: ScoreEvent[], ratio: number): ScoreEvent[] {
  for (const event of events) {
    const value = beats(event.duration) * ratio;
    if (!isSupportedDuration(value)) {
      throw new Error(
        "Fitting this rhythm would require unsupported tuplets. Keep durations or edit the rhythm first.",
      );
    }
    event.duration = durationFromBeats(value);
  }
  return events;
}

/** Removes `excess` beats of trailing rests, refusing to cut a note. */
function trimTrailingRests(measure: Measure, excess: number, meter: Meter, prefix: string) {
  const removedIds: string[] = [];
  while (excess > 0) {
    const last = measure.events.at(-1)!;
    if (last.pitch) {
      throw new Error(
        `Changing to ${meterName(meter)} would cut notes. Choose Fit rhythm or make room with rests first.`,
      );
    }
    const lastStart = onsetOf(measure, measure.events.length - 1);
    measure.events.pop();
    removedIds.push(last.id);
    const remainder = beats(last.duration) - excess;
    if (remainder > 0) measure.events.push(...makeRests(remainder, prefix, lastStart, meter));
    excess = Math.max(0, -remainder);
  }
  return { events: measure.events, removedIds };
}
