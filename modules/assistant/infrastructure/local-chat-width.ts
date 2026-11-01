import { CHAT_WIDTH } from "../application/chat-width";

const KEY = "amanuensis.chatWidth";

/** The width this browser last dragged the chat to; the narrowest when none was kept. */
export function loadChatWidth(): number {
  try {
    const width = Number(localStorage.getItem(KEY));
    return Number.isFinite(width) && width > 0 ? width : CHAT_WIDTH.min;
  } catch {
    return CHAT_WIDTH.min;
  }
}

export function saveChatWidth(width: number): void {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // Not kept: the chat opens at its narrowest next time.
  }
}
