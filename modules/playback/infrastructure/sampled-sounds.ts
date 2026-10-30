import { HttpStorage, Sampler, Soundfont, type Smplr, type Storage } from "smplr";
import type { SoundId, SoundOutput, SoundRequest } from "../application/sound-port";
import { drumsPreset, pianoPreset, soundfontUrl } from "./sound-sources";

/** Give up on samples after this long and fall back to reference tones. */
export const SOUND_LOAD_TIMEOUT_MS = 10_000;
/** Stop fades everything out this fast (seconds): quick enough to feel instant, slow enough not to click. */
const STOP_FADE = 0.04;
/** After a stop, the output opens again once the stopped notes' release tails are over. */
const REOPEN_AFTER = 0.6;
/** A scheduled note is forgotten this long after it ends (its release tail included). */
const RELEASE_ALLOWANCE = 1;

/**
 * smplr only logs a sample it could not fetch. This storage fails instead, so a missing or
 * blocked file means "could not load" rather than a silent note.
 */
const strictStorage: Storage = {
  async fetch(url) {
    const response = await HttpStorage.fetch(url);
    if (response.status !== 200) throw new Error(`Sound file ${url} returned ${response.status}`);
    return response;
  },
};

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Sounds took too long to load")), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Sampled instruments through smplr: one sampler per instrument, loaded on first use and kept, all
 * through one output that Stop fades out. Every note's own stop is kept until it has ended:
 * smplr queues notes scheduled ahead, and stopping its samplers only silences notes already sounding.
 */
export class SampledSounds implements SoundOutput {
  private samplers = new Map<SoundId, Smplr>();
  private loading = new Map<SoundId, Promise<void>>();
  /** Each note scheduled or sounding: its stop, and when it is over. */
  private scheduled = new Map<() => void, number>();
  private readonly output: GainNode;
  /** After a stop, the output is closed until this audio time, unless a new note opens it. */
  private closedUntil = 0;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
    this.output.connect(context.destination);
  }

  /** True once every listed sound has loaded. */
  isReady(instruments: SoundId[]) {
    return instruments.every((id) => this.samplers.has(id));
  }

  prepare(instruments: SoundId[]) {
    return Promise.all(instruments.map((id) => this.load(id))).then(() => undefined);
  }

  play({ instrument, midi, time, duration, velocity }: SoundRequest) {
    const sampler = this.samplers.get(instrument);
    if (!sampler) return () => {};
    this.reopen(time);
    this.forgetEnded();
    const stop = sampler.start({ note: midi, time, duration, velocity });
    this.scheduled.set(stop, time + duration + RELEASE_ALLOWANCE);
    return () => {
      stop();
      this.scheduled.delete(stop);
    };
  }

  /** Cancels every note still queued, stops those sounding, and fades the output out at once. */
  stopAll() {
    for (const stop of this.scheduled.keys()) stop();
    this.scheduled.clear();
    for (const sampler of this.samplers.values()) sampler.stop();
    const now = this.context.currentTime;
    const gain = this.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + STOP_FADE);
    gain.setValueAtTime(1, now + REOPEN_AFTER);
    this.closedUntil = now + REOPEN_AFTER;
  }

  /** A note played while the output is closed after a stop opens it again just for it (old tails stay cut). */
  private reopen(time: number) {
    if (time >= this.closedUntil) return;
    const gain = this.output.gain;
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(1, time);
    this.closedUntil = 0;
  }

  private forgetEnded() {
    const now = this.context.currentTime;
    for (const [stop, end] of this.scheduled) if (end < now) this.scheduled.delete(stop);
  }

  private load(id: SoundId) {
    let loading = this.loading.get(id);
    if (!loading) {
      const sampler =
        id === "piano" || id === "drums"
          ? Sampler(this.context, {
              preset: id === "piano" ? pianoPreset() : drumsPreset(),
              storage: strictStorage,
              destination: this.output,
            })
          : Soundfont(this.context, {
              instrumentUrl: soundfontUrl(id),
              storage: strictStorage,
              destination: this.output,
            });
      loading = withTimeout(sampler.ready, SOUND_LOAD_TIMEOUT_MS).then(
        () => void this.samplers.set(id, sampler),
        (error) => {
          // Forget the failure so a later Play can try again.
          this.loading.delete(id);
          sampler.dispose();
          throw error;
        },
      );
      this.loading.set(id, loading);
    }
    return loading;
  }
}
