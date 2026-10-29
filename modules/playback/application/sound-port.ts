import type { InstrumentId } from "@/modules/score";

/** A sound set the player can load: one per instrument (drums come later). */
export type SoundId = InstrumentId;

/** One note on the audio clock: `time` and `duration` are in AudioContext seconds. */
export type SoundRequest = { instrument: SoundId; midi: number; time: number; duration: number; velocity: number };

/** Where scheduled notes become sound: sampled instruments, or reference tones as a fallback. */
export interface SoundOutput {
  /** Loads what these instruments need; rejects when the sounds cannot be loaded. */
  prepare(instruments: SoundId[]): Promise<void>;
  /** Schedules one note and returns a function that cuts it off. */
  play(request: SoundRequest): () => void;
  /** Silences everything scheduled or sounding. */
  stopAll(): void;
}
