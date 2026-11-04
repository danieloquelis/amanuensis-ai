import type { Thinking } from "../application/thinking";
import type { VoiceResult } from "../application/handle-voice-request";
import type { AssistantResult, AssistantTurn, ProgressListener } from "../application/run-assistant";
import type { StreamLine } from "./progress-stream";
import type { Score } from "@/modules/score";
import type { SpeechTurn } from "@/modules/voice";

export type AssistantPayload = {
  instruction: string;
  score: Score;
  selectedIds: string[];
  /** What the selection is called ("Bars 3–6"); the musician may refer to it by name. */
  selectionName?: string;
  history: AssistantTurn[];
  /** How long the model may think. */
  thinking?: Thinking;
  /** Band Mode, when on. */
  band?: { on: boolean };
  /** With a take sent again: the words already heard in it, so they are not recognized twice. */
  speech?: SpeechTurn[];
};

const UNAVAILABLE = "The assistant is unavailable right now.";

/**
 * Browser-side call to the app's assistant route: JSON, or multipart with attached files.
 * Throws with the server's readable message.
 */
export async function requestAssistant(
  payload: AssistantPayload,
  onProgress?: ProgressListener,
  files: File[] = [],
  signal?: AbortSignal,
) {
  if (!files.length) {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    return readStream<AssistantResult>(response, onProgress);
  }
  const form = new FormData();
  form.append("request", JSON.stringify(payload));
  for (const file of files) form.append("files", file, file.name);
  return readStream<AssistantResult>(await fetch("/api/assistant", { method: "POST", body: form, signal }), onProgress);
}

/** Sends a recorded take (WAV) with the score and any attached files; the server hears it and runs the assistant. */
export async function requestVoiceAssistant(
  wav: Uint8Array,
  payload: AssistantPayload,
  onProgress?: ProgressListener,
  signal?: AbortSignal,
  files: File[] = [],
) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "take.wav");
  form.append("request", JSON.stringify(payload));
  for (const file of files) form.append("files", file, file.name);
  const response = await fetch("/api/assistant/voice", { method: "POST", body: form, signal });
  return readStream<VoiceResult>(response, onProgress);
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
