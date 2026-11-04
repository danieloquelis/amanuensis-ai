import { useEffect, useRef } from "react";
import type { RequestContext, Assistant } from "@/modules/assistant/ui";
import { takeFirstRequest } from "../../application/first-request";

/** A song's first request is about all of it: nothing is selected yet. */
const WHOLE_SCORE: RequestContext = { ids: [], name: null };

type Options = {
  workspaceId: string;
  /** The saved score is loaded and the chat has been read: the request works on the real song. */
  ready: boolean;
  assistant: Pick<Assistant, "send" | "sendTake">;
  /** Shows the chat, so the musician watches the first turn. */
  openChat: () => void;
};

/**
 * Runs the request made on Home for this song as its first turn, once the song is ready. Taken
 * once, so a remount or a reload never sends it again.
 */
export function useFirstRequest({ workspaceId, ready, assistant, openChat }: Options) {
  // The latest callbacks, so the effect runs only when readiness changes.
  const latest = useRef({ assistant, openChat });
  useEffect(() => {
    latest.current = { assistant, openChat };
  });

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      const request = takeFirstRequest(workspaceId);
      if (!request) return;
      const { assistant, openChat } = latest.current;
      openChat();
      if (request.kind === "take") void assistant.sendTake(request.wav, WHOLE_SCORE, request.files);
      else void assistant.send(request.text, WHOLE_SCORE, request.files);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, workspaceId]);
}
