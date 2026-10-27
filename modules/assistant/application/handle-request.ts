import { z } from "zod";
import { parseScore } from "@/modules/score";
import type { ModelPort } from "./model-port";
import { runAssistant, type AssistantResult } from "./run-assistant";

export const MAX_REQUEST_BYTES = 1_000_000;
const HISTORY_LIMIT = 6;

const requestSchema = z.strictObject({
  instruction: z.string().trim().min(1).max(2000),
  score: z.unknown(),
  selectedIds: z.array(z.string().max(100)).max(64).default([]),
  history: z
    .array(z.strictObject({ instruction: z.string().max(2000), reply: z.string().max(2000) }))
    .max(HISTORY_LIMIT)
    .default([]),
});

export type AssistantResponse = { status: number; body: AssistantResult | { error: string } };

/** Validates an HTTP request body and runs the assistant. Never throws; failures become statuses. */
export async function handleAssistantRequest(body: unknown, model: ModelPort): Promise<AssistantResponse> {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "Send an instruction and the current score." } };
  let score;
  try {
    score = parseScore(parsed.data.score);
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "Invalid score." } };
  }
  try {
    const result = await runAssistant(model, { ...parsed.data, score });
    return { status: 200, body: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant is unavailable.";
    return { status: 502, body: { error: message } };
  }
}
