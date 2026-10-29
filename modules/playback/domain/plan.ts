import {
  barEvents,
  soundingBeats,
  legatoIds,
  measureStarts,
  midiPitch,
  nextEvent,
  type InstrumentId,
  type Score,
  type ScoreEvent,
} from "@/modules/score";
import { voiceChord, writtenChordSegments } from "./chord-track";
import { accented, CHORD_VELOCITY, DEFAULT_VELOCITY, DYNAMIC_VELOCITY } from "./dynamics";
import { performanceOrder, soundingSource } from "./performance-order";
import { joinTies, startingAt } from "./tie-join";

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
  /** MIDI notes that start here; empty is silence: a rest, or a tied note held over from the event before. */
  notes: number[];
  /** MIDI velocity, 1–127, from the dynamic in force and any accent. */
  velocity: number;
  /** What plays it: the instrument of the event's part. */
  instrument: InstrumentId;
  /** Fraction of `duration` that sounds; above 1 when a tie holds the note into the next events. */
  gate: number;
  /** The event this note is tied into, when it is tied. */
  tiedTo?: string;
};

/** A soft piano chord under the melody, as MIDI notes. */
export type ChordSound = { start: number; duration: number; notes: number[]; velocity: number };

export type PlaybackPlan = {
  events: PlaybackEvent[];
  chords: ChordSound[];
  duration: number;
  secondsPerBeat: number;
};

const notesOf = (event: ScoreEvent) => (event.pitch ? [midiPitch(event.pitch)] : []);

/** A slurred note runs into the next, like tenuto; staccato under a slur stays short. */
function gateOf(event: ScoreEvent, slurred: boolean) {
  if (event.articulation === "staccato") return GATE.staccato;
  if (event.articulation === "tenuto" || slurred) return GATE.tenuto;
  return GATE.normal;
}

/**
 * Compiles a score revision into timed sound. Written tempo and dynamics are resolved in score
 * order first; then bars are laid out in performance order (repeats, D.C./D.S., coda), so every
 * pass replays its written context. Chords sound from their beat until the next chord.
 *
 * With `fromMeasureId`, playback begins where that bar is first performed, with the tempo and
 * dynamic in force there; a bar that is never performed plays the whole score.
 */
export function createPlaybackPlan(score: Score, fromMeasureId?: string): PlaybackPlan {
  const written = resolveWrittenEvents(score);
  const harmony = writtenChordSegments(score);
  const startIndex = fromMeasureId ? score.measures.findIndex((m) => m.id === fromMeasureId) : 0;
  const events: PlaybackEvent[] = [];
  const chords: ChordSound[] = [];
  let time = 0;
  let offset: number | null = null;
  for (const measureIndex of performanceOrder(score)) {
    const barEvents = written[measureIndex];
    const barStart = time;
    if (offset === null && measureIndex === startIndex) offset = barStart;
    for (const event of barEvents) {
      events.push({ ...event, start: time });
      time += event.duration;
    }
    const at = (localBeat: number) => barStart + secondsInto(barEvents, localBeat);
    const segments = harmony[measureIndex];
    segments.forEach(({ beat, chord }, i) => {
      const end = i + 1 < segments.length ? at(segments[i + 1].beat) : time;
      chords.push({
        start: at(beat),
        duration: end - at(beat),
        notes: voiceChord(chord),
        velocity: CHORD_VELOCITY,
      });
    });
  }
  const plan = { events, chords, duration: time, secondsPerBeat: 60 / score.tempo };
  // Ties are joined after the start is cut, so starting on a held note still sounds it.
  return joinTies(offset ? startingAt(plan, offset) : plan);
}

/** Seconds from the bar's start to a beat inside it, following the bar's actual event timing. */
function secondsInto(barEvents: Omit<PlaybackEvent, "start">[], localBeat: number): number {
  let seconds = 0;
  let beat = 0;
  for (const event of barEvents) {
    if (localBeat < beat + event.beats) return seconds + ((localBeat - beat) / event.beats) * event.duration;
    seconds += event.duration;
    beat += event.beats;
  }
  return seconds;
}

/** Events per measure with tempo, dynamics, articulation and slurs applied; times not yet placed. */
function resolveWrittenEvents(score: Score): Omit<PlaybackEvent, "start">[][] {
  const starts = measureStarts(score);
  const dynamicAt = (targetId: string) =>
    score.annotations.find((a) => a.targetId === targetId && a.kind === "dynamic");
  const legato = legatoIds(score);
  let tempo = score.tempo;
  let velocity = DEFAULT_VELOCITY;
  // Playback follows the primary voice, played by the first part.
  const instrument = score.parts[0].instrument;
  return score.measures.map((measure, measureIndex) => {
    tempo = measure.tempo ?? tempo;
    // A repeat (%) bar plays its source bar's notes in its own written place and tempo.
    const sounding = barEvents(score.measures[soundingSource(score, measureIndex)]);
    const measureDynamic = dynamicAt(measure.id);
    if (measureDynamic) velocity = DYNAMIC_VELOCITY[measureDynamic.text];
    let localBeat = 0;
    return sounding.map((event) => {
      const eventDynamic = dynamicAt(event.id);
      if (eventDynamic) velocity = DYNAMIC_VELOCITY[eventDynamic.text];
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
        gate: gateOf(event, legato.has(event.id)),
        ...(event.tie ? { tiedTo: nextEvent(score, event.id)?.id } : {}),
      };
      localBeat += length;
      return entry;
    });
  });
}
