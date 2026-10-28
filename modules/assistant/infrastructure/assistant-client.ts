import type { VoiceResult } from "../application/handle-voice-request";
import type { AssistantResult, AssistantTurn } from "../application/run-assistant";
import type { Score } from "@/modules/score";

export type AssistantPayload = { instruction: string; score: Score; selectedIds: string[]; history: AssistantTurn[] };

/** Browser-side call to the app's assistant route. Throws with the server's readable message. */
export async function requestAssistant(payload: AssistantPayload): Promise<AssistantResult> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readResult<AssistantResult>(response);
}

/** Sends a recorded take (WAV) with the score; the server hears it and runs the assistant. */
export async function requestVoiceAssistant(wav: Uint8Array, payload: AssistantPayload): Promise<VoiceResult> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "take.wav");
  form.append("request", JSON.stringify(payload));
  return readResult<VoiceResult>(await fetch("/api/assistant/voice", { method: "POST", body: form }));
}

async function readResult<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "The assistant is unavailable right now.");
  return body as T;
}
