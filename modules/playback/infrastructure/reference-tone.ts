import type { SoundOutput, SoundRequest } from "../application/sound-port";

const ATTACK = 0.012;
const RELEASE = 0.01;
/** Peak gain of a full-velocity tone; softer velocities fall off with the square, like loudness. */
const MAX_GAIN = 0.26;
const MAX_VELOCITY = 127;
/** The tone settles to this fraction of its peak, like a struck string. */
const SUSTAIN = 0.4;

const midiFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Triangle-wave tones: the fallback when instrument sounds cannot load. Needs no files, so it
 * always works.
 */
export class ReferenceTone implements SoundOutput {
  private nodes = new Set<OscillatorNode>();

  constructor(private readonly context: AudioContext) {}

  async prepare() {}

  play({ midi, time, duration, velocity }: SoundRequest) {
    const { context } = this;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const gain = MAX_GAIN * (velocity / MAX_VELOCITY) ** 2;
    const end = time + Math.max(duration, ATTACK + RELEASE);
    oscillator.type = "triangle";
    oscillator.frequency.value = midiFrequency(midi);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + ATTACK);
    envelope.gain.exponentialRampToValueAtTime(gain * SUSTAIN, time + (end - time) * 0.65);
    envelope.gain.linearRampToValueAtTime(0, end - RELEASE);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.nodes.delete(oscillator);
    };
    oscillator.start(time);
    oscillator.stop(end);
    return () => stopNode(oscillator);
  }

  stopAll() {
    for (const node of this.nodes) stopNode(node);
    this.nodes.clear();
  }
}

function stopNode(node: OscillatorNode) {
  try {
    node.stop();
  } catch {
    // Already stopped by the audio clock.
  }
}
