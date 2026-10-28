import type { Signal } from "./pitch-tracker";

const HEADER_BYTES = 44;
const PCM = 1;
const EXTENSIBLE = 0xfffe;
const BITS = 16;
const FULL_SCALE = 32768;

/** Mono 16-bit PCM WAV: the format the speech recognizer and the pitch tracker both read. */
export function encodeWav({ samples, sampleRate }: Signal): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, BITS, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(HEADER_BYTES + i * 2, Math.round(clipped * (FULL_SCALE - 1)), true);
  });
  return bytes;
}

/**
 * Reads a 16-bit PCM WAV (any sample rate; stereo is mixed to mono). Throws a readable error for
 * anything else, so a bad upload is rejected before it reaches a paid service.
 */
export function decodeWav(bytes: Uint8Array): Signal {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < HEADER_BYTES || text(0) !== "RIFF" || text(8) !== "WAVE") throw new Error("Not a WAV file.");
  let format: { channels: number; sampleRate: number } | null = null;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = text(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      const code = view.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE carries the real format code at the start of its subformat GUID.
      const pcm = code === PCM || (code === EXTENSIBLE && size >= 26 && view.getUint16(body + 24, true) === PCM);
      if (!pcm || view.getUint16(body + 14, true) !== BITS) {
        throw new Error("Only 16-bit PCM WAV is supported.");
      }
      format = { channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true) };
    }
    if (id === "data") {
      if (!format) throw new Error("The WAV file has no format chunk.");
      const frames = Math.floor(Math.min(size, bytes.length - body) / (2 * format.channels));
      const samples = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame++) {
        let sum = 0;
        for (let channel = 0; channel < format.channels; channel++) {
          sum += view.getInt16(body + (frame * format.channels + channel) * 2, true);
        }
        samples[frame] = sum / format.channels / FULL_SCALE;
      }
      return { samples, sampleRate: format.sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("The WAV file has no audio.");
}
