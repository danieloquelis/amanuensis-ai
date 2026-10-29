import { beats, measureStarts, midiPitch, type Pitch, type Score, type ScoreEvent } from "@/modules/score";
import { CHORD_VOICE_GAIN, voiceChord, writtenChordSegments } from "./chord-track";
import { performanceOrder, soundingSource } from "./performance-order";

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

/** A soft chord under the melody. */
export type ChordSound = { start: number; duration: number; frequencies: number[]; gain: number };

export type PlaybackPlan = {
  events: PlaybackEvent[];
  chords: ChordSound[];
  duration: number;
  secondsPerBeat: number;
};

/** Equal-tempered frequency of a written pitch, A4 = 440 Hz. */
export const pitchFrequency = (pitch: Pitch) => 440 * 2 ** ((midiPitch(pitch) - 69) / 12);

const frequencyOf = (event: ScoreEvent) => (event.pitch ? pitchFrequency(event.pitch) : null);

function gateOf(event: ScoreEvent) {
  if (event.articulation === "staccato") return GATE.staccato;
  if (event.articulation === "tenuto") return GATE.tenuto;
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
        frequencies: voiceChord(chord),
        gain: CHORD_VOICE_GAIN,
      });
    });
  }
  const plan = { events, chords, duration: time, secondsPerBeat: 60 / score.tempo };
  return offset ? startingAt(plan, offset) : plan;
}

/** The plan from `offset` seconds on, re-timed to start at 0. Chords never cross a bar line. */
function startingAt(plan: PlaybackPlan, offset: number): PlaybackPlan {
  return {
    ...plan,
    events: plan.events.filter((e) => e.start >= offset).map((e) => ({ ...e, start: e.start - offset })),
    chords: plan.chords.filter((c) => c.start >= offset).map((c) => ({ ...c, start: c.start - offset })),
    duration: plan.duration - offset,
  };
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

/** Events per measure with tempo, dynamics and articulation applied; times not yet placed. */
function resolveWrittenEvents(score: Score): Omit<PlaybackEvent, "start">[][] {
  const starts = measureStarts(score);
  const dynamicAt = (targetId: string) =>
    score.annotations.find((a) => a.targetId === targetId && a.kind === "dynamic");
  let tempo = score.tempo;
  let gain = DEFAULT_GAIN;
  return score.measures.map((measure, measureIndex) => {
    tempo = measure.tempo ?? tempo;
    // A repeat (%) bar plays its source bar's notes in its own written place and tempo.
    const sounding = score.measures[soundingSource(score, measureIndex)].events;
    const measureDynamic = dynamicAt(measure.id);
    if (measureDynamic) gain = DYNAMIC_GAIN[measureDynamic.text];
    let localBeat = 0;
    return sounding.map((event) => {
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
