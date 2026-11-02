/** Versioned: widths kept before the chat scaled with the window were never narrower than 520 px. */
const KEY = "amanuensis.chatWidth.v2";

/** The width this browser last dragged the chat to; none when nothing was kept. */
export function loadChatWidth(): number | null {
  try {
    const width = Number(localStorage.getItem(KEY));
    return Number.isFinite(width) && width > 0 ? width : null;
  } catch {
    return null;
  }
}

export function saveChatWidth(width: number): void {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // Not kept: the chat opens at the window's default width next time.
  }
}
