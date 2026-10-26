import { createPlaybackPlan } from "../domain/plan";
import type { Score } from "@/modules/score";

export class AudioPlayer {
  private context: AudioContext | null = null;
  private nodes = new Set<OscillatorNode>();
  private frame = 0;
  private generation = 0;

  stop() {
    this.generation++;
    cancelAnimationFrame(this.frame);
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* Already stopped by the audio clock. */ }
      node.disconnect();
    }
    this.nodes.clear();
  }

  async play(score: Score, update: (beat: number | null) => void) {
    this.stop();
    const generation = this.generation;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (generation !== this.generation) return;
    const context = this.context;
    const plan = createPlaybackPlan(score);
    const origin = context.currentTime + 0.08;
    // Bounded to 32 short measures: schedule on the audio clock, never animation timers.
    for (const event of plan.events) {
      if (event.frequency === null) continue;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = event.frequency;
      const start = origin + event.start;
      const soundingDuration = event.duration * event.gate;
      const end = start + soundingDuration;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(event.gain, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(event.gain * 0.4, start + soundingDuration * 0.65);
      envelope.gain.linearRampToValueAtTime(0, end - 0.01);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      this.nodes.add(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.nodes.delete(oscillator); };
      oscillator.start(start);
      oscillator.stop(end);
    }
    const tick = () => {
      if (generation !== this.generation) return;
      const elapsed = context.currentTime - origin;
      if (elapsed >= plan.duration) { this.stop(); update(null); return; }
      const current = plan.events.find((event) => elapsed >= event.start && elapsed < event.start + event.duration) ?? plan.events[0];
      update(current ? current.beat + Math.max(0, (elapsed - current.start) / current.duration) * current.beats : 0);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  dispose() {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
