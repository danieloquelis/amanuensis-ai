import {
  DEFAULT_PART_VOLUME,
  eventPitches,
  legatoIds,
  measureStarts,
  midiPitch,
  nextEvent,
  soundingBeats,
  voiceBars,
  voiceInfo,
  type Part,
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

/** The voices of a staff. */
const voiceInfoOfStaff = (score: Score, staffId: string) =>
  score.parts
    .flatMap((p) => p.staves)
    .find((s) => s.id === staffId)
    ?.voices.map((v) => v.id) ?? [];

const MAX_VELOCITY = 127;

/** A part's mixer level applied to a velocity: louder or softer, never past the MIDI range. */
const mixed = (velocity: number, part: Part) =>
  Math.max(
    1,
    Math.min(MAX_VELOCITY, Math.round((velocity * (part.volume ?? DEFAULT_PART_VOLUME)) / DEFAULT_PART_VOLUME)),
  );

/**
 * Each bar's voices (every part, the main line first) with tempo, dynamics, articulation, slurs
 * and the mixer applied; times not yet placed. A dynamic on a bar sets the voices of its staff;
 * one on a note sets its own voice. A muted part keeps its timing and sounds nothing.
 */
export function resolveWrittenEvents(score: Score): WrittenLine[][] {
  const starts = measureStarts(score);
  const dynamicAt = (targetId: string) =>
    score.annotations.find((a) => a.targetId === targetId && a.kind === "dynamic");
  const legato = legatoIds(score);
  const firstStaff = score.parts[0].staves[0].id;
  let tempo = score.tempo;
  const staffVelocity = new Map<string, number>();
  const velocities = new Map<string, number>();
  return score.measures.map((measure, measureIndex) => {
    tempo = measure.tempo ?? tempo;
    for (const dynamic of score.annotations.filter((a) => a.targetId === measure.id && a.kind === "dynamic")) {
      const staffId = dynamic.staffId ?? firstStaff;
      staffVelocity.set(staffId, DYNAMIC_VELOCITY[dynamic.text]);
      for (const voice of voiceInfoOfStaff(score, staffId)) velocities.delete(voice);
    }
    // A repeat (%) bar plays its source bar's notes in its own written place and tempo.
    const source = score.measures[soundingSource(score, measureIndex)];
    return voiceBars(source).map(({ voiceId, events }) => {
      const { part, staff } = voiceInfo(score, voiceId)!;
      let localBeat = 0;
      return events.map((event) => {
        const eventDynamic = dynamicAt(event.id);
        if (eventDynamic) velocities.set(voiceId, DYNAMIC_VELOCITY[eventDynamic.text]);
        const velocity = velocities.get(voiceId) ?? staffVelocity.get(staff.id) ?? DEFAULT_VELOCITY;
        const length = soundingBeats(event);
        const stretch = event.articulation === "fermata" ? FERMATA_STRETCH : 1;
        const entry = {
          id: event.id,
          beat: starts[measureIndex] + localBeat,
          beats: length,
          duration: ((length * 60) / tempo) * stretch,
          notes: part.muted ? [] : notesOf(event),
          velocity: mixed(accented(velocity, event.articulation === "accent"), part),
          instrument: part.instrument,
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
