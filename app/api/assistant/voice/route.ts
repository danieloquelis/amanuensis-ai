import { thinkingOf, handleVoiceRequest, MAX_AUDIO_BYTES } from "@/modules/assistant";
import { createMetaModels, logTurn, progressResponse } from "@/modules/assistant/server";
import { archiveTake, cachedRecognizer, createMuseTranscriber, createSwiftF0Tracker } from "@/modules/voice/server";

/** Hearing the take plus several model steps, each of which may think for most of a minute. */
export const maxDuration = 300;

const DEVELOPMENT = process.env.NODE_ENV === "development";
/** Room for the score JSON next to the audio. */
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 1_000_000;

/**
 * Transport only: multipart in (`audio` WAV, `request` JSON), services from server-side env,
 * then the voice use case, streamed as progress lines and a result. In development, transcriptions are cached and takes are kept locally.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Takes can be up to two minutes long." }, { status: 413 });
  }
  const apiKey = process.env.META_AI_API_KEY;
  if (!apiKey) return Response.json({ error: "The assistant is not configured on this server." }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  const audio = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null;
  const payload = parseJson(form?.get("request"));
  const transcriber = createMuseTranscriber(apiKey);
  const recognizer = DEVELOPMENT ? cachedRecognizer(transcriber, ".cache/transcripts") : transcriber;
  const { model, musicians } = createMetaModels(apiKey, process.env, thinkingOf(payload));
  return progressResponse(async (onProgress) => {
    const services = { model, musicians, recognizer, pitchTracker: createSwiftF0Tracker(), signal: request.signal };
    const response = await handleVoiceRequest({ audio, payload }, services, onProgress);
    if (DEVELOPMENT) {
      const selection = (payload as { selectionName?: string } | null)?.selectionName;
      logTurn("(voice take)", selection, response.body);
    }
    if (DEVELOPMENT && audio && response.status === 200 && process.env.VOICE_KEEP_TAKES !== "0") {
      await archiveTake(".takes", audio, response.body).catch(() => undefined);
    }
    return response;
  });
}

function parseJson(value: FormDataEntryValue | null | undefined): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
