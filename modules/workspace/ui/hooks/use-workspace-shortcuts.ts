import { useEffect } from "react";

/** Esc stops playback; Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z redoes, except while typing. */
export function useWorkspaceShortcuts(stop: () => void, undoRedo: (direction: "undo" | "redo") => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoRedo(event.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stop, undoRedo]);
}
