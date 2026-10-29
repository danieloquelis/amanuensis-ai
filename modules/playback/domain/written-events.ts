import {
  eventPitches,
  legatoIds,
  measureStarts,
  midiPitch,
  nextEvent,
  soundingBeats,
  voiceBars,
  type Score,
  type ScoreEvent,
} from "@/modules/score";
import { accented, DEFAULT_VELOCITY, DYNAMIC_VELOCITY } from "./dynamics";
import { soundingSource } from "./performance-order";
import type { PlaybackEvent } from "./plan";

/** Documented reference hold for a fermata, not an interpretation. */
const FERMATA_STRETCH = 1.5;
/** Fraction of the written length that sounds. */
const GATE = { staccato: 0.45, tenuto: 1, normal: 0.93 };

/** One voice's events in one bar, with everything but their start time. */
export type WrittenLine = Omit<PlaybackEvent, "start">[];

/** Every note the event sounds: one, or a chord's. */
const notesOf = (event: ScoreEvent) => eventPitches(event).map(midiPitch);

/** A slurred note runs into the next, like tenuto; staccato under a slur stays short. */
function gateOf(event: ScoreEvent, slurred: boolean) {
  if (event.articulation === "staccato") return GATE.staccato;
  if (event.articulation === "tenuto" || slurred) return GATE.tenuto;
  return GATE.normal;
}

/**
 * Each bar's voices (the main line first) with tempo, dynamics, articulation and slurs applied;
 * times not yet placed. A dynamic on a bar sets every voice; one on a note sets its own voice.
 */
export function resolveWrittenEvents(score: Score): WrittenLine[][] {
  const starts = measureStarts(score);
  const dynamicAt = (targetId: string) =>
    score.annotations.find((a) => a.targetId === targetId && a.kind === "dynamic");
  const legato = legatoIds(score);
  let tempo = score.tempo;
  let barVelocity = DEFAULT_VELOCITY;
  const velocities = new Map<string, number>();
  // Every voice is played by the first part for now: scores hold one instrument.
  const instrument = score.parts[0].instrument;
  return score.measures.map((measure, measureIndex) => {
    tempo = measure.tempo ?? tempo;
    const measureDynamic = dynamicAt(measure.id);
    if (measureDynamic) {
      barVelocity = DYNAMIC_VELOCITY[measureDynamic.text];
      velocities.clear();
    }
    // A repeat (%) bar plays its source bar's notes in its own written place and tempo.
    const source = score.measures[soundingSource(score, measureIndex)];
    return voiceBars(source).map(({ voiceId, events }) => {
      let localBeat = 0;
      return events.map((event) => {
        const eventDynamic = dynamicAt(event.id);
        if (eventDynamic) velocities.set(voiceId, DYNAMIC_VELOCITY[eventDynamic.text]);
        const velocity = velocities.get(voiceId) ?? barVelocity;
        const length = soundingBeats(event);
        const stretch = event.articulation === "fermata" ? FERMATA_STRETCH : 1;
        const entry = {
          id: event.id,
          beat: starts[measureIndex] + localBeat,
          beats: length,
          duration: ((length * 60) / tempo) * stretch,
          notes: notesOf(event),
          velocity: accented(velocity, event.articulation === "accent"),
          instrument,
          voice: voiceId,
          gate: gateOf(event, legato.has(event.id)),
          ...(event.tie ? { tiedTo: nextEvent(score, event.id)?.id } : {}),
        };
        localBeat += length;
        return entry;
      });
    });
  });
}
