import type { Score } from "@/modules/score";
import { createPlaybackPlan, type PlaybackEvent } from "../domain/plan";

/** Small delay so the first note is not clipped while the context starts. */
const START_DELAY = 0.08;
const ATTACK = 0.012;
const RELEASE = 0.01;

/**
 * Web Audio reference-tone player. Notes are scheduled on the audio clock; animation frames
 * only report the playhead and never drive musical timing.
 */
export class AudioPlayer {
  private context: AudioContext | null = null;
  private nodes = new Set<OscillatorNode>();
  private frame = 0;
  /** Incremented on every stop so late callbacks from an older run are ignored. */
  private generation = 0;

  stop() {
    this.generation++;
    cancelAnimationFrame(this.frame);
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped by the audio clock.
      }
      node.disconnect();
    }
    this.nodes.clear();
  }

  /** Plays the score and reports the playhead beat each frame, then `null` when finished. */
  async play(score: Score, onBeat: (beat: number | null) => void) {
    this.stop();
    const generation = this.generation;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (generation !== this.generation) return;
    const context = this.context;
    const plan = createPlaybackPlan(score);
    const origin = context.currentTime + START_DELAY;
    // Bounded to 32 short measures, so the whole score is scheduled up front.
    for (const event of plan.events) {
      if (event.frequency !== null) this.scheduleTone(context, event, event.frequency, origin + event.start);
    }
    const tick = () => {
      if (generation !== this.generation) return;
      const elapsed = context.currentTime - origin;
      if (elapsed >= plan.duration) {
        this.stop();
        onBeat(null);
        return;
      }
      const current =
        plan.events.find((event) => elapsed >= event.start && elapsed < event.start + event.duration) ?? plan.events[0];
      onBeat(current ? current.beat + Math.max(0, (elapsed - current.start) / current.duration) * current.beats : 0);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  dispose() {
    this.stop();
    void this.context?.close();
    this.context = null;
  }

  private scheduleTone(context: AudioContext, event: PlaybackEvent, frequency: number, start: number) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    const sounding = event.duration * event.gate;
    const end = start + sounding;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(event.gain, start + ATTACK);
    envelope.gain.exponentialRampToValueAtTime(event.gain * 0.4, start + sounding * 0.65);
    envelope.gain.linearRampToValueAtTime(0, end - RELEASE);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.nodes.delete(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(end);
  }
}
