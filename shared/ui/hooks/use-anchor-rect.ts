import { useLayoutEffect, useState, type RefObject } from "react";

/** A box relative to the container's visible top-left corner (px). */
export type AnchorRect = { left: number; top: number; right: number; bottom: number };
export type AnchorArea = { width: number; height: number };

const SEPARATOR = "\u0000";

const sameRect = (a: AnchorRect | null, b: AnchorRect | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

/**
 * Where the elements carrying `attribute` with one of `values` are, as one box around them all,
 * relative to `container`, kept up to date through scrolling and resizing. Null when there are
 * none or they are scrolled out of view. `layoutKey` changes whenever they may have moved
 * (a new score revision, zoom).
 */
export function useAnchorRect(
  container: RefObject<HTMLElement | null>,
  attribute: string,
  values: string[],
  layoutKey: string,
): { anchor: AnchorRect | null; area: AnchorArea } {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [area, setArea] = useState<AnchorArea>({ width: 0, height: 0 });
  // The effect depends on the set of values, not on each new array the caller passes.
  const key = values.join(SEPARATOR);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        setArea((old) =>
          old.width === box.width && old.height === box.height ? old : { width: box.width, height: box.height },
        );
        const wanted = key ? key.split(SEPARATOR) : [];
        const selector = wanted.map((value) => `[${attribute}="${CSS.escape(value)}"]`).join(",");
        const rects = selector ? [...element.querySelectorAll(selector)].map((el) => el.getBoundingClientRect()) : [];
        const next = rects.length
          ? {
              left: Math.min(...rects.map((r) => r.left)) - box.left,
              top: Math.min(...rects.map((r) => r.top)) - box.top,
              right: Math.max(...rects.map((r) => r.right)) - box.left,
              bottom: Math.max(...rects.map((r) => r.bottom)) - box.top,
            }
          : null;
        const visible = next && next.bottom > 0 && next.top < box.height && next.right > 0 && next.left < box.width;
        setAnchor((old) => (sameRect(old, visible ? next : null) ? old : visible ? next : null));
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [container, attribute, key, layoutKey]);

  return { anchor, area };
}
