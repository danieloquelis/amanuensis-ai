import type { PitchTrack, Signal } from "../domain/pitch-tracker";

/** A learned pitch tracker run over a whole take (16 kHz mono); YIN is the fallback without one. */
export interface PitchTracker {
  track(signal: Signal): Promise<PitchTrack>;
}
