import { GENERAL_MIDI_PROGRAM, isDrumKit, type Part, type Score } from "@/modules/score";
import { createPlaybackPlan } from "../domain/plan";

/** Ticks per quarter note. */
const PPQ = 480;
/** General MIDI plays drums on channel 10 (9 counting from 0). */
const PERCUSSION_CHANNEL = 9;
const CHANNELS = 16;
const MICROSECONDS = 1_000_000;
const CLOCKS_PER_CLICK = 24;
const THIRTY_SECONDS_PER_QUARTER = 8;

type TrackEvent = { tick: number; bytes: number[] };

/** A number as MIDI writes lengths and times: seven bits a byte, the high bit set on all but the last. */
function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

const text = (value: string) => [...new TextEncoder().encode(value)];
const word = (value: number, size: number) =>
  Array.from({ length: size }, (_, i) => (value >> (8 * (size - 1 - i))) & 0xff);

/** At one tick: names and settings first, the instrument, then notes ending, then notes starting. */
const RANK: Record<number, number> = { 0xf0: 0, 0xc0: 1, 0x80: 2, 0x90: 3 };
const rank = (event: TrackEvent) => RANK[event.bytes[0] & 0xf0] ?? 0;

/** A track chunk: its events in time order. */
function trackChunk(events: TrackEvent[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || rank(a) - rank(b));
  const body: number[] = [];
  let last = 0;
  for (const { tick, bytes } of sorted) {
    body.push(...variableLength(tick - last), ...bytes);
    last = tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return [...text("MTrk"), ...word(body.length, 4), ...body];
}

const meta = (tick: number, type: number, data: number[]): TrackEvent => ({
  tick,
  bytes: [0xff, type, ...variableLength(data.length), ...data],
});

/**
 * The score as a Standard MIDI File (type 1), for other music tools: a first track with the
 * title, tempo and time signature, then one track per part with its name and General MIDI
 * instrument (drums on channel 10). It plays as the app plays it: repeats, D.C. and D.S. taken,
 * dynamics as velocities, ties held. Times come from the playback plan at the opening tempo.
 */
export function scoreToMidi(score: Score): Uint8Array {
  const plan = createPlaybackPlan(score);
  const ticks = (seconds: number) => Math.round((seconds / plan.secondsPerBeat) * PPQ);
  const { numerator, denominator } = score.measures[0].meter;
  const conductor = trackChunk([
    meta(0, 0x03, text(score.title)),
    meta(0, 0x51, word(Math.round(plan.secondsPerBeat * MICROSECONDS), 3)),
    meta(0, 0x58, [numerator, Math.log2(denominator), CLOCKS_PER_CLICK, THIRTY_SECONDS_PER_QUARTER]),
  ]);
  const partOf = new Map<string, Part>(
    score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.voices.map((voice) => [voice.id, part]))),
  );
  let nextChannel = 0;
  const tracks = score.parts.map((part) => {
    const drums = isDrumKit(part.instrument);
    if (!drums && nextChannel === PERCUSSION_CHANNEL) nextChannel++;
    const channel = drums ? PERCUSSION_CHANNEL : nextChannel++ % CHANNELS;
    const events: TrackEvent[] = [meta(0, 0x03, text(part.name))];
    if (!drums) events.push({ tick: 0, bytes: [0xc0 | channel, GENERAL_MIDI_PROGRAM[part.instrument]] });
    for (const event of plan.events) {
      if (partOf.get(event.voice)?.id !== part.id) continue;
      const on = ticks(event.start);
      const off = Math.max(on + 1, ticks(event.start + event.duration * event.gate));
      for (const note of event.notes) {
        events.push({ tick: on, bytes: [0x90 | channel, note, event.velocity] });
        events.push({ tick: off, bytes: [0x80 | channel, note, 0] });
      }
    }
    return trackChunk(events);
  });
  const header = [...text("MThd"), ...word(6, 4), ...word(1, 2), ...word(tracks.length + 1, 2), ...word(PPQ, 2)];
  return new Uint8Array([...header, ...conductor, ...tracks.flat()]);
}
