/**
 * How wide the expanded chat is, in pixels: never narrower than the compose bar needs for its
 * orb, subject, field, attach and thinking controls; never wider than leaves the score room.
 */
export const CHAT_WIDTH = { min: 520, max: 760 } as const;
/** The share of the window the chat may take at most. */
const MAX_SHARE = 0.6;

/** A width the chat may have in a window `viewport` pixels wide. */
export function clampChatWidth(width: number, viewport: number): number {
  const max = Math.max(CHAT_WIDTH.min, Math.min(CHAT_WIDTH.max, viewport * MAX_SHARE));
  return Math.round(Math.min(max, Math.max(CHAT_WIDTH.min, width)));
}
