import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_WIDTH, clampChatWidth } from "../../application/chat-width";
import { loadChatWidth, saveChatWidth } from "../../infrastructure/local-chat-width";

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
  // The expanded chat's width, as the musician last dragged it in this browser (read after mount).
  const [chatWidth, setChatWidth] = useState<number>(CHAT_WIDTH.min);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setChatWidth(clampChatWidth(loadChatWidth(), innerWidth)));
    return () => cancelAnimationFrame(frame);
  }, []);
  /** Keeps a width the musician settled on. */
  const keepChatWidth = useCallback((width: number) => {
    setChatWidth(width);
    saveChatWidth(width);
  }, []);

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

  return {
    inputRef,
    draft,
    setDraft,
    focus,
    chatMode,
    toggleChat,
    openChat,
    expandChat,
    closeChat,
    dismissChat,
    chatWidth,
    setChatWidth,
    keepChatWidth,
  };
}

export type ComposeDockState = ReturnType<typeof useComposeDock>;
