import { useCallback, useRef, useState } from "react";
import type { Command } from "@/modules/score";
import type { EditsEvent } from "../../application/edit-feed";
import type { DraftEvent } from "../../application/score-block-writer";

/**
 * The turn running now: its commands as the server commits them, so the sheet can show them
 * before the turn ends (null when no turn runs; empty while it has written nothing yet), and the
 * means to stop it. `latest` reads the commands where state would be stale (in the request).
 */
export function useLiveTurn() {
  const [commands, setCommands] = useState<Command[] | null>(null);
  // The bars being written right now, before their block closes.
  const [draft, setDraft] = useState<Omit<DraftEvent, "stage"> | null>(null);
  const latest = useRef<Command[]>([]);
  const controller = useRef<AbortController | null>(null);

  /** A turn starts: returns the signal that stops its request. */
  const begin = useCallback(() => {
    controller.current = new AbortController();
    latest.current = [];
    setCommands([]);
    return controller.current.signal;
  }, []);
  const apply = useCallback(({ keep, add }: EditsEvent) => {
    latest.current = [...latest.current.slice(0, keep), ...add];
    setCommands(latest.current);
  }, []);
  const write = useCallback(({ requestId, text, pitches }: DraftEvent) => {
    setDraft(text ? { requestId, text, pitches } : null);
  }, []);
  /** Stops the running turn; what it wrote so far is the caller's to keep. */
  const stop = useCallback(() => controller.current?.abort(), []);
  const end = useCallback(() => {
    controller.current = null;
    latest.current = [];
    setCommands(null);
    setDraft(null);
  }, []);
  return { commands, draft, latest, begin, apply, write, stop, end };
}
