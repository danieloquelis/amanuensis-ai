import { getMeasure } from "../queries";
import { beats, durationFromBeats, isSupportedDuration, measureCapacity, meterName, soundingBeats } from "../rhythm";
import type { Measure, Meter, ScoreEvent } from "../schema";
import { isNote, setBarEvents, voiceBars } from "../voice-access";
import { detachFrom, type Draft, type OperationContext } from "./draft";
import { makeRests, onsetOf } from "./rests";
import type { OperationOf } from "./schema";

type FitPolicy = "preserve" | "scale";

/**
 * Changes the meter of the listed bars (and, with `extend`, of the following bars that share
 * the first bar's meter, up to the next change). `preserve` keeps note durations, padding with
 * rests or trimming trailing rests; `scale` fits the rhythm proportionally; `auto` preserves when
 * the notes fit and scales otherwise. No policy ever cuts a note or invents tuplets. Every voice
 * of a bar is fitted on its own; if any cannot be, nothing changes.
 */
export function setMeter(draft: Draft, op: OperationOf<"setMeter">, { idPrefix }: OperationContext) {
  if (new Set(op.measureIds).size !== op.measureIds.length) throw new Error("Choose each measure once.");
  const policies: FitPolicy[] = op.policy === "auto" ? ["preserve", "scale"] : [op.policy];
  targetMeasures(draft, op).forEach((measure, index) => {
    const fittedBars = voiceBars(measure).map((voiceBar, k) => {
      const prefix = k === 0 ? `${idPrefix}-${index}` : `${idPrefix}-${index}-v${k}`;
      return {
        voiceId: voiceBar.voiceId,
        ...fitWithPolicies(voiceBar.events, measure.meter, op.meter, policies, prefix),
      };
    });
    for (const fitted of fittedBars) {
      setBarEvents(measure, fitted.events, fitted.voiceId);
      detachFrom(draft, fitted.removedIds);
    }
    measure.meter = { ...op.meter };
  });
}

/** The first policy that fits the events into the new meter; throws the last failure when none does. */
function fitWithPolicies(events: ScoreEvent[], from: Meter, to: Meter, policies: FitPolicy[], prefix: string) {
  let failure: unknown;
  for (const policy of policies) {
    try {
      return fitEvents(events, from, to, policy, prefix);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
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

/** Fits one voice bar's events to a new meter without touching the draft; throws when it can't. */
function fitEvents(original: ScoreEvent[], from: Meter, meter: Meter, policy: FitPolicy, prefix: string) {
  const events = structuredClone(original);
  const capacity = measureCapacity(meter);
  const oldCapacity = measureCapacity(from);
  if (events.length === 1 && events[0].measureRest) {
    events[0].duration = durationFromBeats(capacity);
    return { events, removedIds: [] };
  }
  if (policy === "scale") return { events: scaleRhythm(events, capacity / oldCapacity), removedIds: [] };
  if (capacity > oldCapacity) {
    return { events: [...events, ...makeRests(capacity - oldCapacity, prefix, oldCapacity, meter)], removedIds: [] };
  }
  return trimTrailingRests(events, oldCapacity - capacity, meter, prefix);
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
function trimTrailingRests(events: ScoreEvent[], excess: number, meter: Meter, prefix: string) {
  const removedIds: string[] = [];
  while (excess > 0) {
    const last = events.at(-1)!;
    if (isNote(last) || last.tuplet) {
      throw new Error(
        `Changing to ${meterName(meter)} would cut notes. Choose Fit rhythm or make room with rests first.`,
      );
    }
    const lastStart = onsetOf(events, events.length - 1);
    events.pop();
    removedIds.push(last.id);
    const remainder = soundingBeats(last) - excess;
    if (remainder > 0) events.push(...makeRests(remainder, prefix, lastStart, meter));
    excess = Math.max(0, -remainder);
  }
  return { events, removedIds };
}
