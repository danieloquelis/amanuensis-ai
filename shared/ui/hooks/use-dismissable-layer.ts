import { useEffect, type RefObject } from "react";

/**
 * Behaviour for a floating layer such as a menu: focuses its first control, closes on an outside
 * pointer press, outside scroll or window resize, and returns focus to the previous element.
 */
export function useDismissableLayer(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.querySelector<HTMLElement>("button, input")?.focus();
    const isOutside = (event: Event) => !ref.current?.contains(event.target as Node);
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event)) onClose();
    };
    const onScroll = (event: Event) => {
      if (isOutside(event)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      const focusWasInLayer = document.activeElement === document.body || element?.contains(document.activeElement);
      if (previouslyFocused?.isConnected && focusWasInLayer) previouslyFocused.focus();
    };
  }, [ref, onClose]);
}
