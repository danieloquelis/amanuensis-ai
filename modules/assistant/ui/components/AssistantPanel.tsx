import { useEffect, useRef } from "react";
import type { Assistant, RequestContext } from "../hooks/use-assistant";
import { CloseIcon } from "./icons";
import { Composer } from "./Composer";
import { TurnBubbles } from "./TurnBubbles";
import styles from "./assistant.module.css";

const EXAMPLES = ["Chords C, F, G7, C — one per bar", "Make bar 3 a slash bar", "Add D.C. al Fine at the end"];

type AssistantPanelProps = {
  assistant: Assistant;
  /** What a message sent from here is about: the current selection, or the whole score. */
  context: RequestContext;
  revision: number;
  onUndo: () => void;
  onClose: () => void;
};

/**
 * The chat: the whole conversation, including what was asked from the sheet, with typed or
 * spoken instructions (a take can mix talking and singing) and live progress. Edits land in the
 * score directly; the latest answer can undo its turn.
 */
export function AssistantPanel({ assistant, context, revision, onUndo, onClose }: AssistantPanelProps) {
  const { turns, busy, send, sendTake } = assistant;
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);
  const undoable = [...turns].reverse().find((turn) => turn.revision !== undefined);

  return (
    <aside className={styles.panel} aria-label="Assistant">
      <div className={styles.header}>
        <span>Assistant</span>
        <button className={styles.closePanel} aria-label="Close chat" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <ol ref={listRef} className={styles.turns} aria-live="polite">
        {!turns.length && (
          <li className={styles.welcome}>
            <p>Tell me what to change, or tap the mic and sing.</p>
            <div className={styles.examples}>
              {EXAMPLES.map((example) => (
                <button key={example} onClick={() => void send(example, context)}>
                  {example}
                </button>
              ))}
            </div>
          </li>
        )}
        {turns.map((turn) => (
          <TurnBubbles
            key={turn.id}
            turn={turn}
            canUndo={turn === undoable && turn.revision === revision}
            busy={busy}
            onUndo={onUndo}
            onChoose={(choice) => void send(choice, context)}
          />
        ))}
      </ol>
      {context.name && <p className={styles.panelContext}>About {context.name}</p>}
      <Composer busy={busy} onSend={(text) => void send(text, context)} onTake={(wav) => void sendTake(wav, context)} />
    </aside>
  );
}
