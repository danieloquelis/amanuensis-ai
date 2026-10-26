import { beats, measureStarts, midiPitch, type Score, type ScoreEvent } from "@/modules/score";

/** Reference-tone gain for each written dynamic. */
const DYNAMIC_GAIN: Record<string, number> = { pp: 0.045, p: 0.07, mp: 0.1, mf: 0.14, f: 0.19, ff: 0.24 };
const DEFAULT_GAIN = DYNAMIC_GAIN.mf;
const ACCENT_GAIN = 1.3;
/** Documented reference hold for a fermata, not an interpretation. */
const FERMATA_STRETCH = 1.5;
/** Fraction of the written length that sounds. */
const GATE = { staccato: 0.45, tenuto: 1, normal: 0.93 };

export type PlaybackEvent = {
  id: string;
  /** Written position in the score, for the playhead. */
  beat: number;
  beats: number;
  /** Seconds from the start of playback. */
  start: number;
  duration: number;
  frequency: number | null;
  gain: number;
  gate: number;
};

export type PlaybackPlan = { events: PlaybackEvent[]; duration: number; secondsPerBeat: number };

const frequencyOf = (event: ScoreEvent) => (event.pitch ? 440 * 2 ** ((midiPitch(event.pitch) - 69) / 12) : null);

function gateOf(event: ScoreEvent) {
  if (event.articulation === "staccato") return GATE.staccato;
  if (event.articulation === "tenuto") return GATE.tenuto;
  return GATE.normal;
}

/**
 * Compiles a score revision into timed sound events. Written tempo and dynamics are resolved in
 * score order first, then repeats are unfolded, so each pass replays the written context.
 */
export function createPlaybackPlan(score: Score): PlaybackPlan {
  const written = resolveWrittenEvents(score);
  let time = 0;
  const events = unfoldRepeats(score).flatMap((measureIndex) =>
    written[measureIndex].map((event) => {
      const entry = { ...event, start: time };
      time += event.duration;
      return entry;
    }),
  );
  return { events, duration: time, secondsPerBeat: 60 / score.tempo };
}

/** Events per measure with tempo, dynamics and articulation applied; times not yet placed. */
function resolveWrittenEvents(score: Score): Omit<PlaybackEvent, "start">[][] {
  const starts = measureStarts(score);
  const dynamicAt = (targetId: string) =>
    score.annotations.find((a) => a.targetId === targetId && a.kind === "dynamic");
  let tempo = score.tempo;
  let gain = DEFAULT_GAIN;
  return score.measures.map((measure, measureIndex) => {
    tempo = measure.tempo ?? tempo;
    const measureDynamic = dynamicAt(measure.id);
    if (measureDynamic) gain = DYNAMIC_GAIN[measureDynamic.text];
    let localBeat = 0;
    return measure.events.map((event) => {
      const eventDynamic = dynamicAt(event.id);
      if (eventDynamic) gain = DYNAMIC_GAIN[eventDynamic.text];
      const length = beats(event.duration);
      const stretch = event.articulation === "fermata" ? FERMATA_STRETCH : 1;
      const entry = {
        id: event.id,
        beat: starts[measureIndex] + localBeat,
        beats: length,
        duration: ((length * 60) / tempo) * stretch,
        frequency: frequencyOf(event),
        gain: gain * (event.articulation === "accent" ? ACCENT_GAIN : 1),
        gate: gateOf(event),
      };
      localBeat += length;
      return entry;
    });
  });
}

/** Measure indexes in performance order, with each repeat range played `count` times. */
function unfoldRepeats(score: Score): number[] {
  const order: number[] = [];
  for (let index = 0; index < score.measures.length; index++) {
    const repeat = score.repeats.find((r) => r.startMeasureId === score.measures[index].id);
    if (!repeat) {
      order.push(index);
      continue;
    }
    const end = score.measures.findIndex((m) => m.id === repeat.endMeasureId);
    for (let pass = 0; pass < repeat.count; pass++) {
      for (let bar = index; bar <= end; bar++) order.push(bar);
    }
    index = end;
  }
  return order;
}
