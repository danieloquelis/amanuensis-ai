import { HttpStorage, Sampler, type Storage } from "smplr";
import type { SoundId, SoundOutput, SoundRequest } from "../application/sound-port";
import { pianoPreset } from "./sound-sources";

/** Give up on samples after this long and fall back to reference tones. */
export const SOUND_LOAD_TIMEOUT_MS = 10_000;

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

/** Sampled instruments through smplr: one sampler per sound, loaded once and kept. */
export class SampledSounds implements SoundOutput {
  private samplers = new Map<SoundId, Sampler>();
  private loading = new Map<SoundId, Promise<void>>();

  constructor(private readonly context: AudioContext) {}

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
    return sampler.start({ note: midi, time, duration, velocity });
  }

  stopAll() {
    for (const sampler of this.samplers.values()) sampler.stop();
  }

  private load(id: SoundId) {
    let loading = this.loading.get(id);
    if (!loading) {
      const sampler = Sampler(this.context, { preset: pianoPreset(), storage: strictStorage });
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
