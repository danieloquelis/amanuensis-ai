import type { Score } from "@/modules/score";
import type { SoundId, SoundOutput, SoundRequest } from "../application/sound-port";
import { createPlaybackPlan, type PlaybackPlan } from "../domain/plan";
import { soundsBetween } from "../domain/schedule-window";
import { ReferenceTone } from "./reference-tone";
import { SampledSounds } from "./sampled-sounds";
import { probeSound } from "./sound-probe";

/** Small delay so the first note is not clipped while the context starts. */
const START_DELAY = 0.08;
/** Notes are scheduled this many seconds ahead, refilled on a timer (the Web Audio lookahead pattern). */
const LOOKAHEAD = 1.5;
const REFILL_MS = 100;
/** A clicked or moved note: short enough to keep up with a drag, long enough to hear the pitch. */
const AUDITION = { duration: 0.45, velocity: 80, delay: 0.012 };

export type PlaybackListener = {
  /** The playhead beat each frame, then `null` when finished. */
  onBeat: (beat: number | null) => void;
  /** True while instrument sounds load before the first note. */
  onLoading: (loading: boolean) => void;
  /** Sounds could not load; the score plays with reference tones instead. */
  onFallback: () => void;
};

/**
 * Web Audio transport. Notes are scheduled on the audio clock, a window ahead at a time, through a
 * sound output (sampled instruments, or reference tones when they cannot load); animation frames
 * only report the playhead and never drive musical timing.
 */
export class AudioPlayer {
  private context: AudioContext | null = null;
  private sampled: SampledSounds | null = null;
  private reference: ReferenceTone | null = null;
  private frame = 0;
  private refill: ReturnType<typeof setInterval> | undefined;
  /** Incremented on every stop so late callbacks from an older run are ignored. */
  private generation = 0;
  /** Cuts off the note being auditioned when the next one sounds. */
  private auditioned: (() => void) | null = null;

  stop() {
    this.generation++;
    cancelAnimationFrame(this.frame);
    clearInterval(this.refill);
    this.sampled?.stopAll();
    this.reference?.stopAll();
  }

  /** Plays the score, from a bar if given. */
  async play(score: Score, listener: PlaybackListener, fromMeasureId?: string) {
    this.stop();
    const generation = this.generation;
    const context = this.audioContext();
    await context.resume();
    const plan = createPlaybackPlan(score, fromMeasureId);
    const output = await this.loadedOutput(instrumentsOf(plan), listener);
    if (generation !== this.generation) return;
    const origin = context.currentTime + START_DELAY;
    let scheduledUntil = 0;
    const schedule = () => {
      const until = context.currentTime - origin + LOOKAHEAD;
      for (const { start, ...sound } of soundsBetween(plan, scheduledUntil, until))
        this.sound(output, { ...sound, time: origin + start });
      scheduledUntil = until;
    };
    schedule();
    this.refill = setInterval(schedule, REFILL_MS);
    const tick = () => {
      if (generation !== this.generation) return;
      const elapsed = context.currentTime - origin;
      if (elapsed >= plan.duration) {
        this.stop();
        listener.onBeat(null);
        return;
      }
      listener.onBeat(playheadBeat(plan, elapsed));
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  /**
   * Sounds one note now, cutting off the previous audition so a fast drag never piles up. Until
   * the instrument has loaded, the note sounds as a reference tone and loading starts.
   */
  audition(midi: number, instrument: SoundId) {
    const context = this.audioContext();
    void context.resume();
    this.auditioned?.();
    const sampled = this.sampledSounds();
    const ready = sampled.isReady([instrument]);
    if (!ready) sampled.prepare([instrument]).catch(() => {});
    const output = ready ? sampled : this.referenceTone();
    const request = { instrument, midi, velocity: AUDITION.velocity, duration: AUDITION.duration };
    this.auditioned = this.sound(output, { ...request, time: context.currentTime + AUDITION.delay });
  }

  dispose() {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.sampled = null;
    this.reference = null;
  }

  private async loadedOutput(instruments: SoundId[], listener: PlaybackListener): Promise<SoundOutput> {
    const sampled = this.sampledSounds();
    if (sampled.isReady(instruments)) return sampled;
    listener.onLoading(true);
    try {
      await sampled.prepare(instruments);
      return sampled;
    } catch {
      listener.onFallback();
      return this.referenceTone();
    } finally {
      listener.onLoading(false);
    }
  }

  private sound(output: SoundOutput, request: SoundRequest) {
    probeSound(request);
    return output.play(request);
  }

  private audioContext() {
    this.context ??= new AudioContext();
    return this.context;
  }

  private sampledSounds() {
    this.sampled ??= new SampledSounds(this.audioContext());
    return this.sampled;
  }

  private referenceTone() {
    this.reference ??= new ReferenceTone(this.audioContext());
    return this.reference;
  }
}

/** Every instrument the plan plays, chord symbols' piano included. */
const instrumentsOf = (plan: PlaybackPlan): SoundId[] => [
  ...new Set(soundsBetween(plan, 0, plan.duration + 1).map((sound) => sound.instrument)),
];

/** The written beat sounding `elapsed` seconds into the plan. */
function playheadBeat(plan: PlaybackPlan, elapsed: number) {
  // The main line plays in every bar, so it gives the time.
  const timeline = plan.events.filter((event) => event.voice === plan.primaryVoice);
  const current =
    timeline.find((event) => elapsed >= event.start && elapsed < event.start + event.duration) ?? timeline[0];
  return current ? current.beat + Math.max(0, (elapsed - current.start) / current.duration) * current.beats : 0;
}
