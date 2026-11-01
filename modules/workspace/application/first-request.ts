import type { StartRequest } from "@/modules/assistant";

/**
 * Requests made on Home, waiting for the song they created to open. Held in memory only: a take's
 * audio and attached files cannot be stored, and opening the song is an in-app navigation, so the
 * request is picked up within the same page. A reload in between drops it; the song stays.
 */
const waiting = new Map<string, StartRequest>();

/** Keeps a request for the song just created under `workspaceId`. */
export function holdFirstRequest(workspaceId: string, request: StartRequest): void {
  waiting.set(workspaceId, request);
}

/** The request waiting for this song, once: taking it clears it, so it never runs twice. */
export function takeFirstRequest(workspaceId: string): StartRequest | null {
  const request = waiting.get(workspaceId) ?? null;
  waiting.delete(workspaceId);
  return request;
}
