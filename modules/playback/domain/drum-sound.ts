import { CHOKES_OPEN_HAT, DRUM_PIECES, isDrumKit, type ScoreEvent } from "@/modules/score";
import type { PlaybackEvent } from "./plan";

/**
 * Drums sound as struck, not as written: a hit rings out its sample whatever its written length
 * (an eighth on the crash still crashes), except an open hi-hat, which the next closed or pedal
 * hi-hat of the kit chokes.
 */

/** Long enough for a crash to ring out; a sample shorter than this simply ends. */
export const DRUM_RING_SECONDS = 3;
const EPSILON = 1e-6;

const OPEN_HAT = DRUM_PIECES.hatopen.midi;
const CHOKERS = new Set(CHOKES_OPEN_HAT.map((piece) => DRUM_PIECES[piece].midi));

/** The sample notes a drum hit plays (General MIDI drum notes). */
export const drumNotes = (event: ScoreEvent) => (event.drums ?? []).map((piece) => DRUM_PIECES[piece].midi);

/** The gate that lets a hit of `duration` seconds ring for the drum ring time. */
export const drumGate = (duration: number) => DRUM_RING_SECONDS / Math.max(duration, EPSILON);

/** Cuts each open hi-hat at the next closed or pedal hi-hat of the kit. */
export function chokeOpenHats(events: PlaybackEvent[]): void {
  const hits = events.filter((e) => isDrumKit(e.instrument) && e.notes.length).sort((a, b) => a.start - b.start);
  hits.forEach((hit, i) => {
    if (!hit.notes.includes(OPEN_HAT)) return;
    const choke = hits
      .slice(i + 1)
      .find((next) => next.start > hit.start + EPSILON && next.notes.some((n) => CHOKERS.has(n)));
    if (choke) hit.gate = Math.min(hit.gate, (choke.start - hit.start) / hit.duration);
  });
}
