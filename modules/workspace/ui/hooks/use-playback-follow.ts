import { useEffect, useRef, type RefObject } from "react";
import { followPlayhead, type Box } from "../../application/sheet-view";

/** A new target closer than this (px) to the one being scrolled to is the same. */
const SAME_TARGET = 2;

const box = (element: Element): Box => {
  const { top, bottom, left, right } = element.getBoundingClientRect();
  return { top, bottom, left, right };
};

/**
 * While the score plays, the sheet scrolls smoothly to keep the line being played in the middle
 * of the view. When playback stops the view stays where it is.
 */
export function usePlaybackFollow(scroller: RefObject<HTMLElement | null>, playBeat: number | null) {
  const target = useRef<{ top: number; left: number } | null>(null);
  useEffect(() => {
    const element = scroller.current;
    if (playBeat === null || !element) {
      target.current = null;
      return;
    }
    const playhead = element.querySelector("[data-playhead]");
    if (!playhead) return;
    const next = followPlayhead(box(element), box(playhead), { top: element.scrollTop, left: element.scrollLeft });
    const last = target.current;
    if (!next) return;
    if (last && Math.abs(last.top - next.top) < SAME_TARGET && Math.abs(last.left - next.left) < SAME_TARGET) return;
    target.current = next;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ ...next, behavior: still ? "auto" : "smooth" });
  }, [scroller, playBeat]);
}
