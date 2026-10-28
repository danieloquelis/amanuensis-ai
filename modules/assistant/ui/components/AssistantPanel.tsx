import { useEffect, useRef, useState } from "react";
import type { Command, Score } from "@/modules/score";
import { useVoiceRecorder } from "@/modules/voice/ui";
import { useAssistant, type Turn } from "../hooks/use-assistant";
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
 * Typed or spoken instructions in (a take can mix talking and singing), short result cards out.
 * Edits land in the score directly; each card can undo its turn.
 */
export function AssistantPanel({ getScore, revision, selectedIds, applyCommands, onUndo }: AssistantPanelProps) {
  const { turns, busy, send, sendTake } = useAssistant({ getScore, selectedIds, applyCommands });
  const recorder = useVoiceRecorder((wav) => void sendTake(wav));
  const recording = recorder.status === "recording";
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  const submit = (text: string) => {
    void send(text);
    setDraft("");
  };
  const undoable = [...turns].reverse().find((turn) => turn.revision !== undefined);

  return (
    <aside className={styles.panel} aria-label="Assistant">
      <div className={styles.header}>Assistant</div>
      <ol ref={listRef} className={styles.turns} aria-live="polite">
        {!turns.length && (
          <li>
            <p className={styles.empty}>Tell me what to change, in your own words.</p>
            <div className={styles.examples}>
              {EXAMPLES.map((example) => (
                <button key={example} onClick={() => submit(example)}>
                  {example}
                </button>
              ))}
            </div>
          </li>
        )}
        {turns.map((turn) => (
          <li key={turn.id}>
            <p className={styles.instruction}>{turn.instruction}</p>
            <TurnResult
              turn={turn}
              canUndo={turn === undoable && turn.revision === revision}
              onUndo={onUndo}
              onChoose={submit}
              busy={busy}
            />
          </li>
        ))}
      </ol>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        {recording ? (
          <p className={styles.listening} role="status">
            Listening… {formatSeconds(recorder.seconds)}
          </p>
        ) : (
          <textarea
            aria-label="Instruction for the assistant"
            placeholder="Type, or tap Sing to talk and sing"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              submit(draft);
            }}
          />
        )}
        <button
          type="button"
          className={recording ? `${styles.sing} ${styles.recording}` : styles.sing}
          disabled={busy || recorder.status === "processing"}
          onClick={() => (recording ? recorder.stop() : void recorder.start())}
        >
          {recording ? "Stop" : "Sing"}
        </button>
        {!recording && (
          <button className={styles.send} disabled={busy || !draft.trim()}>
            Send
          </button>
        )}
      </form>
      {recorder.error && <p className={styles.recorderError}>{recorder.error}</p>}
    </aside>
  );
}

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

type TurnResultProps = {
  turn: Turn;
  canUndo: boolean;
  onUndo: () => void;
  onChoose: (text: string) => void;
  busy: boolean;
};

function TurnResult({ turn, canUndo, onUndo, onChoose, busy }: TurnResultProps) {
  if (turn.status === "working") return <p className={styles.working}>Working on the score…</p>;
  return (
    <div className={turn.status === "failed" ? `${styles.card} ${styles.failed}` : styles.card}>
      <p>{turn.reply}</p>
      {turn.changes && turn.changes.length > 0 && <p className={styles.changes}>{turn.changes.join(" · ")}</p>}
      {(turn.question || canUndo) && (
        <div className={styles.actions}>
          {turn.question?.choices.map((choice) => (
            <button key={choice} disabled={busy} onClick={() => onChoose(choice)}>
              {choice}
            </button>
          ))}
          {canUndo && <button onClick={onUndo}>Undo</button>}
        </div>
      )}
    </div>
  );
}
