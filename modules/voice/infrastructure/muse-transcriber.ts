import { z } from "zod";
import type { SpeechRecognizer } from "../application/speech-port";
import type { SpeechTurn } from "../domain/take";

export const META_API_URL = "https://api.meta.ai/v1";
const MODEL = "muse-voice-transcribe-1.0";
const TIMEOUT_MS = 30_000;
const MS_PER_SECOND = 1000;
/**
 * Music terms the recognizer should expect in a musician's instructions (Muse Voice Transcribe's
 * keyword biasing). It hears most of them unaided; the list keeps the rare ones from turning into
 * common words ("chords" heard as "courts"). Any language can be added; the song's part names are
 * sent with every take as well.
 */
const MUSIC_WORDS = [
  ...["beats per minute", "BPM", "Allegro", "Andante", "Adagio", "major", "minor", "sharp", "flat"],
  ...["bar", "bars", "chord", "chords", "drums", "bass", "trumpet", "guitar", "slashes", "triplet", "groove"],
  ...["compás", "compases", "acorde", "acordes", "batería", "bajo", "trompeta", "guitarra", "flauta"],
  ...["tresillo", "corchea", "negra", "blanca", "redonda", "silencio", "tonalidad", "sostenido", "bemol"],
];

const replySchema = z.object({
  turns: z
    .array(z.object({ startMs: z.number().min(0), endMs: z.number().min(0), transcript: z.string() }))
    .default([]),
});

/**
 * Muse Voice Transcribe adapter (server-only: it holds the API key). Speech comes back as
 * turns with millisecond times. Held singing mostly yields no words, but short sung syllables
 * come back written as words ("da da da"); the take sorts those out (see `singingEvidence`).
 */
export function createMuseTranscriber(apiKey: string, baseUrl = META_API_URL): SpeechRecognizer {
  return {
    async transcribe(wav: Uint8Array, hints: string[] = []): Promise<SpeechTurn[]> {
      const form = new FormData();
      const settings = {
        mode: "ENDPOINTING",
        model: MODEL,
        audioEncoding: "WAV",
        keywords: [...MUSIC_WORDS, ...hints],
      };
      form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
      form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "take.wav");
      const response = await fetch(`${baseUrl}/asr/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Speech recognition failed (${response.status}).`);
      const reply = replySchema.safeParse(await response.json().catch(() => null));
      if (!reply.success) throw new Error("Speech recognition returned an unexpected reply.");
      return reply.data.turns
        .filter((turn) => turn.transcript.trim())
        .map((turn) => ({
          start: turn.startMs / MS_PER_SECOND,
          end: turn.endMs / MS_PER_SECOND,
          text: turn.transcript.trim(),
        }));
    },
  };
}
