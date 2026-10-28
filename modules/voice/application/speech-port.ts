import type { SpeechTurn } from "../domain/take";

/** Turns a take's audio (mono 16-bit WAV) into what was said, with times. */
export interface SpeechRecognizer {
  transcribe(wav: Uint8Array, hints?: string[]): Promise<SpeechTurn[]>;
}
