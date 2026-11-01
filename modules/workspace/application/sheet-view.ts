/** Where the sheet is scrolled to, in pixels. */
export type SheetView = { top: number; left: number };

/** Where each song's sheet was left, so it opens there again. */
export type SheetViews = {
  load(workspaceId: string): SheetView | null;
  save(workspaceId: string, view: SheetView): void;
  remove(workspaceId: string): void;
};

/** A box on screen: the scrolling area, or the playhead's line. */
export type Box = { top: number; bottom: number; left: number; right: number };

/** The playhead may sit this share of the view either side of its middle before the view moves. */
const MIDDLE_BAND = 0.15;
/** Kept between the playhead and the side of the view, as a share of its width. */
const SIDE_ROOM = 0.15;

/**
 * Where to scroll so the part being played stays in view: its line of music in the middle, from
 * top to bottom, and the playhead clear of the sides. Null while it already is, so the view only
 * moves when the music reaches a new line (or the playhead nears a side).
 *
 * @param view the scrolling area on screen
 * @param playhead the playhead's line on screen
 * @param scroll how far the area is scrolled now
 */
export function followPlayhead(view: Box, playhead: Box, scroll: SheetView): SheetView | null {
  const height = view.bottom - view.top;
  const width = view.right - view.left;
  const middle = (view.top + view.bottom) / 2;
  const lineMiddle = (playhead.top + playhead.bottom) / 2;
  const offMiddle = Math.abs(lineMiddle - middle) > height * MIDDLE_BAND;
  const room = width * SIDE_ROOM;
  const offSide = playhead.left < view.left + room || playhead.right > view.right - room;
  if (!offMiddle && !offSide) return null;
  return {
    top: offMiddle ? Math.max(0, scroll.top + lineMiddle - middle) : scroll.top,
    left: offSide ? Math.max(0, scroll.left + playhead.left - (view.left + room)) : scroll.left,
  };
}
