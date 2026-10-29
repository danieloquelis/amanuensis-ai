import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Sheet zoom in percent: half size to double. */
export const ZOOM_RANGE = { min: 50, max: 200, initial: 100 } as const;
/** How strongly a wheel step zooms: a pinch sends many small steps, a mouse wheel a few large ones. */
const WHEEL_SENSITIVITY = 0.01;

const clampZoom = (zoom: number) => Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, Math.round(zoom)));

/** Safari's trackpad pinch: `scale` is relative to the start of the gesture. */
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

/**
 * Zooms the sheet with a trackpad pinch (Chrome and Firefox send it as a Ctrl+wheel, Safari as
 * gesture events) or Ctrl/⌘ + mouse wheel, instead of zooming the whole page. The point under
 * the pointer stays where it is.
 */
export function usePinchZoom(scroller: RefObject<HTMLElement | null>, zoom: number, onZoom: (zoom: number) => void) {
  const latest = useRef(zoom);
  /** The content point (scroll coordinates) under the pointer, and where the pointer is, for the next render. */
  const anchor = useRef<{ x: number; y: number; px: number; py: number; ratio: number } | null>(null);

  useEffect(() => {
    latest.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const zoomTo = (next: number, clientX: number, clientY: number) => {
      const target = clampZoom(next);
      if (target === latest.current) return;
      const rect = element.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      anchor.current = {
        x: element.scrollLeft + px,
        y: element.scrollTop + py,
        px,
        py,
        ratio: target / latest.current,
      };
      latest.current = target;
      onZoom(target);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomTo(latest.current * Math.exp(-event.deltaY * WHEEL_SENSITIVITY), event.clientX, event.clientY);
    };
    let gestureStart = latest.current;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureStart = latest.current;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureEvent;
      zoomTo(gestureStart * gesture.scale, gesture.clientX, gesture.clientY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("gesturestart", onGestureStart);
    element.addEventListener("gesturechange", onGestureChange);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
    };
  }, [scroller, onZoom]);

  // After the sheet has its new size, scroll so the anchored point is back under the pointer.
  useLayoutEffect(() => {
    const element = scroller.current;
    const point = anchor.current;
    if (!element || !point) return;
    anchor.current = null;
    element.scrollTo({ left: point.x * point.ratio - point.px, top: point.y * point.ratio - point.py });
  }, [scroller, zoom]);
}
