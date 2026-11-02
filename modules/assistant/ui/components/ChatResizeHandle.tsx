import { useRef } from "react";
import { clampChatWidth, maxChatWidth, minChatWidth } from "../../application/chat-width";
import styles from "./assistant.module.css";

/** One arrow-key press widens or narrows the chat by this much (px). */
const KEY_STEP = 24;

/**
 * The expanded chat's right edge: dragged (or moved with the arrow keys) to make the chat wider,
 * down to its narrowest. `onResize` hears each width; `onDone` the one to keep.
 */
export function ChatResizeHandle({
  width,
  onResize,
  onDone,
}: {
  width: number;
  onResize: (width: number) => void;
  onDone: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const resize = (next: number) => clampChatWidth(next, innerWidth);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Chat width"
      aria-valuemin={minChatWidth(innerWidth)}
      aria-valuemax={maxChatWidth(innerWidth)}
      aria-valuenow={width}
      tabIndex={0}
      className={styles.resizeHandle}
      onPointerDown={(e) => {
        // A press here only resizes: it starts no text selection across the page.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width, last: width };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        drag.current.last = resize(drag.current.width + e.clientX - drag.current.x);
        onResize(drag.current.last);
      }}
      onPointerUp={() => {
        if (drag.current) onDone(drag.current.last);
        drag.current = null;
      }}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" ? KEY_STEP : e.key === "ArrowLeft" ? -KEY_STEP : 0;
        if (!step) return;
        e.preventDefault();
        onDone(resize(width + step));
      }}
    />
  );
}
