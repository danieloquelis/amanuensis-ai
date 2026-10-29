import type { PlaybackEvent, PlaybackPlan } from "./plan";

/**
 * A tied note sounds once, for its whole held length: it keeps sounding through each event of its
 * voice it is tied into (when that event is performed next), and those events fall silent.
 */
export function joinTies(plan: PlaybackPlan): PlaybackPlan {
  const events = plan.events.map((event) => ({ ...event }));
  const heads = new Map<string, PlaybackEvent>();
  const previous = new Map<string, PlaybackEvent>();
  for (const event of events) {
    const head = heads.get(event.voice);
    if (head && previous.get(event.voice)?.tiedTo === event.id) {
      head.gate = (event.start + event.duration * event.gate - head.start) / head.duration;
      event.notes = [];
    } else {
      heads.set(event.voice, event);
    }
    previous.set(event.voice, event);
  }
  return { ...plan, events };
}

/** The plan from `offset` seconds on, re-timed to start at 0. Chords never cross a bar line. */
export function startingAt(plan: PlaybackPlan, offset: number): PlaybackPlan {
  return {
    ...plan,
    events: plan.events.filter((e) => e.start >= offset).map((e) => ({ ...e, start: e.start - offset })),
    chords: plan.chords.filter((c) => c.start >= offset).map((c) => ({ ...c, start: c.start - offset })),
    duration: plan.duration - offset,
  };
}
