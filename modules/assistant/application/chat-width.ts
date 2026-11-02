/**
 * How wide the expanded chat is, in pixels, for a window `viewport` pixels wide. It scales with the
 * window, so a laptop keeps room for the score and a wide screen gets a roomier chat: never
 * narrower than the compose bar needs (orb, field and its icons), never wider than leaves the score room.
 */
const NARROWEST = 360;
/** The narrowest a person may drag it, as a share of the window, up to this many pixels. */
const MIN_SHARE = 0.26;
const MIN_CAP = 480;
/** How wide it opens before a person drags it, as a share of the window, up to this many pixels. */
const DEFAULT_SHARE = 0.3;
const DEFAULT_CAP = 520;
/** The widest it may be dragged: a share of the window, up to this many pixels. */
const MAX_SHARE = 0.6;
const MAX_CAP = 760;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/** The narrowest the chat may be in this window. */
export const minChatWidth = (viewport: number) => Math.round(clamp(viewport * MIN_SHARE, NARROWEST, MIN_CAP));

/** The widest the chat may be in this window. */
export const maxChatWidth = (viewport: number) =>
  Math.round(Math.max(minChatWidth(viewport), Math.min(MAX_CAP, viewport * MAX_SHARE)));

/** How wide the chat opens in this window when no width was kept. */
export const defaultChatWidth = (viewport: number) =>
  Math.round(clamp(viewport * DEFAULT_SHARE, minChatWidth(viewport), DEFAULT_CAP));

/** A width the chat may have in this window. */
export function clampChatWidth(width: number, viewport: number): number {
  return Math.round(clamp(width, minChatWidth(viewport), maxChatWidth(viewport)));
}
