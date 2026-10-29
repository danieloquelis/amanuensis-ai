import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Turn } from "../hooks/use-assistant";
import { TurnBubbles } from "./TurnBubbles";
import styles from "./assistant.module.css";

type ChatThreadProps = {
  turns: Turn[];
  busy: boolean;
  canUndo: (turnId: string) => boolean;
  canRetry: (turn: Turn) => boolean;
  onUndo: () => void;
  onRetry: (turnId: string) => void;
  onChoose: (text: string) => void;
  /** Buttons on the right of the header: expand, collapse or close, depending on where it is. */
  actions: ReactNode;
  /** Shown when there is nothing yet (suggestions, in the sidebar). */
  empty?: ReactNode;
};

/**
 * The conversation: each request with what it was about, then the answer or live progress,
 * newest at the bottom. Edits land in the score directly; the latest one can be undone here.
 */
export function ChatThread(props: ChatThreadProps) {
  const { turns, busy, canUndo, canRetry, onUndo, onRetry, onChoose, actions, empty } = props;
  const listRef = useRef<HTMLOListElement>(null);
  const opened = useRef(false);
  // The chat opens already at its newest message; while it is open, new messages scroll into view.
  useLayoutEffect(() => {
    const behavior = opened.current ? "smooth" : "instant";
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
    opened.current = true;
  }, [turns]);

  return (
    <>
      <header className={styles.chatHeader}>
        <span>Chat</span>
        <span className={styles.chatActions}>{actions}</span>
      </header>
      <ol ref={listRef} className={styles.turnList} aria-live="polite">
        {turns.map((turn) => (
          <TurnBubbles
            key={turn.id}
            turn={turn}
            canUndo={canUndo(turn.id)}
            canRetry={canRetry(turn)}
            busy={busy}
            onUndo={onUndo}
            onRetry={() => void onRetry(turn.id)}
            onChoose={onChoose}
          />
        ))}
        {!turns.length && empty}
      </ol>
    </>
  );
}
