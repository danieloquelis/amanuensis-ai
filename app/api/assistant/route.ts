import { handleAssistantRequest, MAX_REQUEST_BYTES } from "@/modules/assistant";
import { createMetaModel, progressResponse } from "@/modules/assistant/server";

/** Transport only: size check, model from server-side env, then the assistant use case, streamed. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return Response.json({ error: "The score is too large to send." }, { status: 413 });
  }
  const apiKey = process.env.META_AI_API_KEY;
  if (!apiKey) return Response.json({ error: "The assistant is not configured on this server." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const model = createMetaModel(apiKey, process.env.META_AI_MODEL);
  return progressResponse((onProgress) => handleAssistantRequest(body, model, onProgress));
}
