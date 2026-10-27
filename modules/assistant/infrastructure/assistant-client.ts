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
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "The assistant is unavailable right now.");
  return body as AssistantResult;
}
