import type { PlaybackPlan } from "./plan";

/**
 * A tied note sounds once, for its whole held length: it keeps sounding through each event it is
 * tied into (when that event is performed next), and those events fall silent.
 */
export function joinTies(plan: PlaybackPlan): PlaybackPlan {
  const events = plan.events.map((event) => ({ ...event }));
  let head: (typeof events)[number] | null = null;
  events.forEach((event, i) => {
    const previous = events[i - 1];
    if (head && previous?.tiedTo === event.id) {
      head.gate = (event.start + event.duration * event.gate - head.start) / head.duration;
      event.notes = [];
    } else {
      head = event;
    }
  });
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
