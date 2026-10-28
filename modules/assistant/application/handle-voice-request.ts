import { z } from "zod";
import { parseScore } from "@/modules/score";
import { createTake, decodeWav, type SpeechRecognizer, type SpeechTurn, type SungSpan } from "@/modules/voice";
import type { ModelPort } from "./model-port";
import { runAssistant, type AssistantResult, type ProgressListener } from "./run-assistant";

/** Two minutes of 16 kHz mono 16-bit audio, with room for the WAV header. */
export const MAX_AUDIO_BYTES = 16_000 * 2 * 120 + 1024;
const MAX_TAKE_SECONDS = 120;
const HISTORY_LIMIT = 6;

const payloadSchema = z.strictObject({
  instruction: z.string().trim().max(2000).default(""),
  score: z.unknown(),
  selectedIds: z.array(z.string().max(100)).max(64).default([]),
  history: z
    .array(z.strictObject({ instruction: z.string().max(2000), reply: z.string().max(2000) }))
    .max(HISTORY_LIMIT)
    .default([]),
});

/** What the take contained, so the musician can see what was heard. */
export type HeardTake = { speech: SpeechTurn[]; sung: SungSpan[] };
export type VoiceResult = AssistantResult & { heard: HeardTake };
export type VoiceResponse = { status: number; body: VoiceResult | { error: string } };

const failure = (status: number, error: string): VoiceResponse => ({ status, body: { error } });
const NOTHING_USED = { inputTokens: 0, outputTokens: 0 };

/**
 * One recorded take: check the audio, hear what was said (paid, once), find where they sang,
 * then let the agent act on both. A take with neither words nor singing never reaches the model.
 * Never throws; failures become statuses.
 */
export async function handleVoiceRequest(
  input: { audio: Uint8Array | null; payload: unknown },
  services: { model: ModelPort; recognizer: SpeechRecognizer },
  onProgress: ProgressListener = () => {},
): Promise<VoiceResponse> {
  if (!input.audio?.length) return failure(400, "Record a take first.");
  if (input.audio.length > MAX_AUDIO_BYTES) return failure(413, "Takes can be up to two minutes long.");
  const parsed = payloadSchema.safeParse(input.payload);
  if (!parsed.success) return failure(400, "Send the current score with the take.");
  let signal;
  let score;
  try {
    signal = decodeWav(input.audio);
    score = parseScore(parsed.data.score);
  } catch (error) {
    return failure(400, error instanceof Error ? error.message : "Invalid take.");
  }
  if (signal.samples.length / signal.sampleRate > MAX_TAKE_SECONDS) {
    return failure(413, "Takes can be up to two minutes long.");
  }
  let speech: SpeechTurn[];
  onProgress({ stage: "hearing" });
  try {
    speech = await services.recognizer.transcribe(input.audio);
  } catch (error) {
    return failure(502, error instanceof Error ? error.message : "Speech recognition failed.");
  }
  const take = createTake(signal, speech);
  const heard = { speech: take.speech, sung: take.sung };
  if (!take.speech.length && !take.sung.length && !parsed.data.instruction) {
    const reply = "I didn't hear anything. Try again a little closer to the microphone.";
    return {
      status: 200,
      body: { reply, question: null, commands: [], changes: [], steps: 0, usage: NOTHING_USED, trace: [], heard },
    };
  }
  try {
    const result = await runAssistant(services.model, { ...parsed.data, score, take }, undefined, onProgress);
    return { status: 200, body: { ...result, heard } };
  } catch (error) {
    return failure(502, error instanceof Error ? error.message : "The assistant is unavailable.");
  }
}
