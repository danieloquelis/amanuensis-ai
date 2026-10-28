import { encodeWav } from "../domain/wav";

/** What the speech recognizer accepts and the pitch tracker handles well. */
export const TAKE_SAMPLE_RATE = 16_000;

/**
 * Raw microphone audio. Browsers otherwise clean speech for calls: noise suppression and
 * automatic gain bend sustained notes, and echo cancellation can swallow quiet ones.
 */
export const MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

/** A browser recording (any format the browser can decode) as 16 kHz mono 16-bit WAV. */
export async function recordingToWav(recording: Blob): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const frames = Math.ceil(decoded.duration * TAKE_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, Math.max(1, frames), TAKE_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    // Rendering to one channel mixes down and resamples with the browser's own filtering.
    const rendered = await offline.startRendering();
    return encodeWav({ samples: rendered.getChannelData(0), sampleRate: TAKE_SAMPLE_RATE });
  } finally {
    await context.close();
  }
}
