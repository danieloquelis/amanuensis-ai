import {
  thinkingOf,
  ATTACHMENT_LIMITS,
  handleAssistantRequest,
  MAX_REQUEST_BYTES,
  type Upload,
} from "@/modules/assistant";
import { createMetaModels, logTurn, progressResponse } from "@/modules/assistant/server";
import { createPageImages } from "@/modules/page/server";

const DEVELOPMENT = process.env.NODE_ENV === "development";

/**
 * Several model steps, each of which may think for most of a minute; reading a page takes more of
 * them. 300 seconds is the most Vercel's Hobby plan allows (a Band Mode turn takes 140–240 s).
 */
export const maxDuration = 300;

/** Room for attached files next to the score JSON. */
const MAX_BODY_BYTES = MAX_REQUEST_BYTES + ATTACHMENT_LIMITS.totalBytes;

/**
 * Transport only: JSON in, or multipart (`request` JSON plus `files`) when files are attached;
 * size check, model from server-side env, then the assistant use case, streamed.
 */
export async function POST(request: Request) {
  const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data") ?? false;
  if (Number(request.headers.get("content-length") ?? 0) > (multipart ? MAX_BODY_BYTES : MAX_REQUEST_BYTES)) {
    return Response.json({ error: "The request is too large to send." }, { status: 413 });
  }
  const apiKey = process.env.META_AI_API_KEY;
  if (!apiKey) return Response.json({ error: "The assistant is not configured on this server." }, { status: 503 });
  const { body, uploads } = multipart ? await readForm(request) : { body: await request.json().catch(() => null) };
  const { model, musicians } = createMetaModels(apiKey, process.env, thinkingOf(body));
  return progressResponse(async (onProgress) => {
    // A musician who stops the turn closes the request: the agent stops with it.
    const pageImages = uploads?.length ? createPageImages() : null;
    const services = { uploads, pageImages, signal: request.signal, musicians };
    const response = await handleAssistantRequest(body, model, onProgress, services);
    if (DEVELOPMENT) logTurn(String(body?.instruction ?? ""), body?.selectionName, response.body);
    return response;
  });
}

async function readForm(request: Request): Promise<{ body: Record<string, unknown> | null; uploads: Upload[] }> {
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((file): file is File => file instanceof File);
  const uploads = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mediaType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
  const text = form?.get("request");
  try {
    return { body: typeof text === "string" ? JSON.parse(text) : null, uploads };
  } catch {
    return { body: null, uploads };
  }
}
