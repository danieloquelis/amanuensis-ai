import { useCallback, useEffect, useRef, useState } from "react";

/** Closed; floating above the compose bar; or expanded into a sidebar that holds the bar too. */
export type ChatMode = "closed" | "floating" | "sidebar";

/**
 * The compose bar's own state: its text field (⌘K / Ctrl+K focuses it from anywhere), the draft
 * typed into it (kept when the bar moves between the bottom of the screen and the sidebar), and
 * where the chat is. Sending opens the chat; Escape or a press on the score folds the floating chat away.
 */
export function useComposeDock() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("closed");

  const focus = useCallback(() => inputRef.current?.focus(), []);
  const toggleChat = useCallback(() => setChatMode((mode) => (mode === "closed" ? "floating" : "closed")), []);
  const openChat = useCallback(() => setChatMode((mode) => (mode === "closed" ? "floating" : mode)), []);
  const expandChat = useCallback(() => setChatMode("sidebar"), []);
  const closeChat = useCallback(() => setChatMode("closed"), []);
  /** Folds the floating chat away (Escape, or a press on the score); an expanded sidebar stays. */
  const dismissChat = useCallback(() => setChatMode((mode) => (mode === "floating" ? "closed" : mode)), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focus();
      }
      if (event.key === "Escape") dismissChat();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focus, dismissChat]);

  return { inputRef, draft, setDraft, focus, chatMode, toggleChat, openChat, expandChat, closeChat, dismissChat };
}

export type ComposeDockState = ReturnType<typeof useComposeDock>;
