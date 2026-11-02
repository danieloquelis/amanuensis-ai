import { z } from "zod";
import type { PageImages } from "@/modules/page";
import { parseScore } from "@/modules/score";
import { readUploads, type Upload } from "./attachments";
import type { ModelPort } from "./model-port";
import { runAssistant, type AssistantResult, type ProgressListener } from "./run-assistant";
import { declineIfOutOfScope } from "./scope-gate";
import { MEMORY_LIMIT, SONG_NOTES_LIMIT } from "./agent-state";
import { bandSchema } from "./musicians";
import { thinkingSchema } from "./thinking";

export const MAX_REQUEST_BYTES = 1_000_000;
const HISTORY_LIMIT = 6;

const requestSchema = z.strictObject({
  /** May be empty when files are attached: the files are the request. */
  instruction: z.string().trim().max(2000),
  score: z.unknown(),
  selectedIds: z.array(z.string().max(100)).max(64).default([]),
  selectionName: z.string().trim().max(120).optional(),
  history: z
    .array(z.strictObject({ instruction: z.string().max(2000), reply: z.string().max(2000) }))
    .max(HISTORY_LIMIT)
    .default([]),
  /** How long the model may think; the route reads it (see `thinkingOf`). */
  thinking: thinkingSchema.optional(),
  /** What the agent wrote down about this song, and has learned about the musician. */
  songNotes: z.string().max(SONG_NOTES_LIMIT).optional(),
  memory: z.array(z.string().max(MEMORY_LIMIT.characters)).max(MEMORY_LIMIT.facts).optional(),
  band: bandSchema.optional(),
});

export type AssistantResponse = { status: number; body: AssistantResult | { error: string } };

/**
 * Validates an HTTP request body (and any attached files) and runs the assistant. Never throws;
 * failures become statuses.
 */
export async function handleAssistantRequest(
  body: unknown,
  model: ModelPort,
  onProgress?: ProgressListener,
  {
    uploads = [],
    pageImages = null,
    signal,
    musicians,
  }: { uploads?: Upload[]; pageImages?: PageImages | null; signal?: AbortSignal; musicians?: ModelPort } = {},
): Promise<AssistantResponse> {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.instruction && !uploads.length)) {
    return { status: 400, body: { error: "Send an instruction and the current score." } };
  }
  const read = readUploads(uploads);
  if ("error" in read) return { status: 400, body: { error: read.error } };
  let score;
  try {
    score = parseScore(parsed.data.score);
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "Invalid score." } };
  }
  try {
    // Words about something else never reach the agent (attached music always does).
    const outside = read.attachments.length ? null : await declineIfOutOfScope(model, parsed.data, signal);
    if (outside) return { status: 200, body: outside };
    const result = await runAssistant(
      model,
      { ...parsed.data, score, attachments: read.attachments },
      undefined,
      onProgress,
      { pageImages, signal, musicians },
    );
    return { status: 200, body: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant is unavailable.";
    return { status: 502, body: { error: message } };
  }
}
