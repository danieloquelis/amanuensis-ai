import { DEFAULT_THINKING, thinkingSchema, type Thinking } from "../application/thinking";

const KEY = "amanuensis.thinking";

/** The thinking level this browser last chose; the default when none was kept or storage is blocked. */
export function loadThinking(): Thinking {
  try {
    const parsed = thinkingSchema.safeParse(localStorage.getItem(KEY));
    return parsed.success ? parsed.data : DEFAULT_THINKING;
  } catch {
    return DEFAULT_THINKING;
  }
}

export function saveThinking(level: Thinking): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    // Not kept: the next visit starts at the default again.
  }
}
