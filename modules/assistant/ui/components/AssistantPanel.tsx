import { useEffect, useRef } from "react";
import type { Command, Score } from "@/modules/score";
import { useAssistant } from "../hooks/use-assistant";
import { Composer } from "./Composer";
import { TurnBubbles } from "./TurnBubbles";
import styles from "./assistant.module.css";

const EXAMPLES = ["Chords C, F, G7, C — one per bar", "Make bar 3 a slash bar", "Add D.C. al Fine at the end"];

type AssistantPanelProps = {
  getScore: () => Score;
  revision: number;
  selectedIds: string[];
  applyCommands: (commands: Command[], receipt: string) => boolean;
  onUndo: () => void;
};

/**
 * A conversation with the assistant: typed or spoken instructions (a take can mix talking and
 * singing) and its answers, with live progress while it works. Edits land in the score
 * directly; the latest answer can undo its turn.
 */
export function AssistantPanel({ getScore, revision, selectedIds, applyCommands, onUndo }: AssistantPanelProps) {
  const { turns, busy, send, sendTake } = useAssistant({ getScore, selectedIds, applyCommands });
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);
  const undoable = [...turns].reverse().find((turn) => turn.revision !== undefined);

  return (
    <aside className={styles.panel} aria-label="Assistant">
      <div className={styles.header}>Assistant</div>
      <ol ref={listRef} className={styles.turns} aria-live="polite">
        {!turns.length && (
          <li className={styles.welcome}>
            <p>Tell me what to change, or tap the mic and sing.</p>
            <div className={styles.examples}>
              {EXAMPLES.map((example) => (
                <button key={example} onClick={() => void send(example)}>
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
            onChoose={(choice) => void send(choice)}
          />
        ))}
      </ol>
      <Composer busy={busy} onSend={(text) => void send(text)} onTake={(wav) => void sendTake(wav)} />
    </aside>
  );
}
