import { useLayoutEffect, useState, type RefObject } from "react";

/** Mark a panel that floats out of a bottom-docked element (like a chat above a bar) with this. */
export const DOCKED_PANEL = "data-docked-panel";

/**
 * How far (px) from the bottom of `container` the top of `element` reaches, counting panels
 * inside it marked with `DOCKED_PANEL` that float above it: the strip the docked UI takes. Kept up
 * to date as panels open, close or resize; 0 when nothing is there.
 */
export function useBottomInset(container: RefObject<HTMLElement | null>, element: RefObject<HTMLElement | null>) {
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    const box = container.current;
    const docked = element.current;
    if (!box || !docked) return;
    const panels = () => [docked, ...docked.querySelectorAll<HTMLElement>(`[${DOCKED_PANEL}]`)];
    const measure = () => {
      const rects = panels()
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.height > 0);
      const top = Math.min(...rects.map((rect) => rect.top));
      setInset(rects.length ? Math.max(0, box.getBoundingClientRect().bottom - top) : 0);
    };
    const resizes = new ResizeObserver(measure);
    const watch = () => {
      resizes.disconnect();
      [box, ...panels()].forEach((el) => resizes.observe(el));
      measure();
    };
    watch();
    // Panels come and go (the chat opens and closes): re-observe whenever the docked UI changes.
    const mutations = new MutationObserver(watch);
    mutations.observe(docked, { childList: true, subtree: true });
    // A panel that slides in moves without resizing: measure again where its animation ends.
    docked.addEventListener("animationend", measure);
    docked.addEventListener("transitionend", measure);
    return () => {
      resizes.disconnect();
      mutations.disconnect();
      docked.removeEventListener("animationend", measure);
      docked.removeEventListener("transitionend", measure);
    };
  }, [container, element]);
  return inset;
}
