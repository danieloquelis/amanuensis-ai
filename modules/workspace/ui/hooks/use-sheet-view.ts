import { useEffect, type RefObject } from "react";
import type { SheetViews } from "../../application/sheet-view";

/** Scrolling settles for this long (ms) before the view is kept. */
const SETTLE_MS = 250;

/**
 * The sheet opens where it was left, after a refresh too: the scroll position is kept per song
 * once the score is on screen (`ready`), and saved as the musician (or playback) scrolls.
 */
export function useSheetView(
  scroller: RefObject<HTMLElement | null>,
  workspaceId: string,
  ready: boolean,
  views: SheetViews,
) {
  useEffect(() => {
    const element = scroller.current;
    if (!ready || !element) return;
    // Restored once the sheet is drawn, so there is room to scroll into.
    const frame = requestAnimationFrame(() => {
      const view = views.load(workspaceId);
      if (view) element.scrollTo(view);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keep = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => views.save(workspaceId, { top: element.scrollTop, left: element.scrollLeft }),
        SETTLE_MS,
      );
    };
    element.addEventListener("scroll", keep, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      element.removeEventListener("scroll", keep);
    };
  }, [scroller, workspaceId, ready, views]);
}
