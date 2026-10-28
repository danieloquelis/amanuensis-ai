import { handleAssistantRequest, MAX_REQUEST_BYTES } from "@/modules/assistant";
import { createMetaModel, progressResponse } from "@/modules/assistant/server";

/** Several model steps, each of which may think for most of a minute. */
export const maxDuration = 300;

/** Transport only: size check, model from server-side env, then the assistant use case, streamed. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return Response.json({ error: "The score is too large to send." }, { status: 413 });
  }
  const apiKey = process.env.META_AI_API_KEY;
  if (!apiKey) return Response.json({ error: "The assistant is not configured on this server." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const model = createMetaModel(apiKey, process.env.META_AI_MODEL, process.env.META_AI_REASONING_EFFORT);
  return progressResponse((onProgress) => handleAssistantRequest(body, model, onProgress));
}
