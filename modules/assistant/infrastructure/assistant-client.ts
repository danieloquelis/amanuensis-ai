import type { VoiceResult } from "../application/handle-voice-request";
import type { AssistantResult, AssistantTurn, ProgressListener } from "../application/run-assistant";
import type { StreamLine } from "./progress-stream";
import type { Score } from "@/modules/score";

export type AssistantPayload = { instruction: string; score: Score; selectedIds: string[]; history: AssistantTurn[] };

const UNAVAILABLE = "The assistant is unavailable right now.";

/** Browser-side call to the app's assistant route. Throws with the server's readable message. */
export async function requestAssistant(payload: AssistantPayload, onProgress?: ProgressListener) {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readStream<AssistantResult>(response, onProgress);
}

/** Sends a recorded take (WAV) with the score; the server hears it and runs the assistant. */
export async function requestVoiceAssistant(wav: Uint8Array, payload: AssistantPayload, onProgress?: ProgressListener) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "take.wav");
  form.append("request", JSON.stringify(payload));
  return readStream<VoiceResult>(await fetch("/api/assistant/voice", { method: "POST", body: form }), onProgress);
}

/** Reads progress lines as they arrive and resolves with the final result line. */
async function readStream<T>(response: Response, onProgress: ProgressListener = () => {}): Promise<T> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? UNAVAILABLE);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffered += value ?? "";
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const text of lines.filter(Boolean)) {
      const line = JSON.parse(text) as StreamLine;
      if (line.type === "progress") onProgress(line.event);
      else if (line.status >= 400) throw new Error((line.body as { error?: string })?.error ?? UNAVAILABLE);
      else return line.body as T;
    }
    if (done) throw new Error(UNAVAILABLE);
  }
}
