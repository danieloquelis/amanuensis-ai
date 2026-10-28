import { useCallback, useEffect, useState } from "react";
import type { Assistant } from "./use-assistant";

/**
 * The composer on the sheet: open or closed (⌘K / Ctrl+K toggles it from anywhere, Escape
 * closes it), and the answer to show in it, which is the latest request sent from the sheet
 * since it was opened.
 */
export function useCanvasComposer(assistant: Assistant) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(0);
  const turnCount = assistant.turns.length;

  const show = useCallback(() => {
    setSince(turnCount);
    setOpen(true);
  }, [turnCount]);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) hide();
        else show();
      }
      if (event.key === "Escape" && open) hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, show, hide]);

  const turn = assistant.turns
    .slice(since)
    .filter((t) => t.origin === "canvas")
    .at(-1);
  return { open, show, hide, turn: open ? (turn ?? null) : null };
}
