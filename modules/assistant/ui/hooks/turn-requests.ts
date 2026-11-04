import { withHeardWords, type AskedTake } from "../../application/asked-take";
import type { HeardTake } from "../../application/handle-voice-request";
import type { AssistantResult, ProgressListener } from "../../application/run-assistant";
import { requestAssistant, requestVoiceAssistant, type AssistantPayload } from "../../infrastructure/assistant-client";

/** How a turn reaches the server: called with the turn's payload, again on a retry. */
export type TurnRequest = (
  payload: AssistantPayload,
  onProgress: ProgressListener,
  signal: AbortSignal,
) => Promise<AssistantResult & { heard?: HeardTake }>;

/** Typed words, with any files. */
export const typedRequest =
  (files: File[]): TurnRequest =>
  (payload, progress, signal) =>
    requestAssistant(payload, progress, files, signal);

/**
 * A recorded take, with any files. With `asked`, typed words follow up on that take: it is sent
 * with the words it was heard as, so it is not recognized again.
 */
export const voiceRequest =
  (wav: Uint8Array, files: File[], asked?: AskedTake): TurnRequest =>
  (payload, progress, signal) =>
    requestVoiceAssistant(wav, asked ? withHeardWords(payload, asked) : payload, progress, signal, files);
