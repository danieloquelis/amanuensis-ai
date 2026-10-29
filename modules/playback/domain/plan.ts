import { primaryVoiceId, type InstrumentId, type Score } from "@/modules/score";
import { voiceChord, writtenChordSegments } from "./chord-track";
import { CHORD_VELOCITY } from "./dynamics";
import { performanceOrder } from "./performance-order";
import { joinTies, startingAt } from "./tie-join";
import { resolveWrittenEvents } from "./written-events";

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
  /** The voice it belongs to; ties join events of one voice. */
  voice: string;
  /** Fraction of `duration` that sounds; above 1 when a tie holds the note into the next events. */
  gate: number;
  /** The event this note is tied into, when it is tied. */
  tiedTo?: string;
};

/** A soft piano chord under the melody, as MIDI notes. */
export type ChordSound = { start: number; duration: number; notes: number[]; velocity: number };

export type PlaybackPlan = {
  /** Every voice's events; each bar's voices start together. */
  events: PlaybackEvent[];
  /** The voice whose events the playhead follows: the main line, which plays in every bar. */
  primaryVoice: string;
  chords: ChordSound[];
  duration: number;
  secondsPerBeat: number;
};

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
    const voices = written[measureIndex];
    const barStart = time;
    if (offset === null && measureIndex === startIndex) offset = barStart;
    for (const line of voices) {
      let at = barStart;
      for (const event of line) {
        events.push({ ...event, start: at });
        at += event.duration;
      }
    }
    // The main line sets the bar's length (another voice's fermata may hold a little longer).
    const main = voices[0];
    time = barStart + main.reduce((sum, event) => sum + event.duration, 0);
    const at = (localBeat: number) => barStart + secondsInto(main, localBeat);
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
  const plan = {
    events,
    primaryVoice: primaryVoiceId(score),
    chords,
    duration: time,
    secondsPerBeat: 60 / score.tempo,
  };
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
