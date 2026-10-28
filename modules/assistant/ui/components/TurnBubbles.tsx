import type { TakePart } from "@/modules/voice";
import { sungLength, type Turn } from "../hooks/use-assistant";
import { useActivityLine } from "../hooks/use-activity-line";
import { MicIcon } from "./icons";
import styles from "./assistant.module.css";

type TurnBubblesProps = {
  turn: Turn;
  canUndo: boolean;
  busy: boolean;
  onUndo: () => void;
  onChoose: (text: string) => void;
};

/** One exchange: what the musician said or typed, then the assistant's answer or live progress. */
export function TurnBubbles({ turn, canUndo, busy, onUndo, onChoose }: TurnBubblesProps) {
  return (
    <li className={styles.exchange}>
      <div className={styles.mine}>
        {turn.context && <span className={styles.contextChip}>{turn.context}</span>}
        {turn.spoken && (
          <span className={styles.spoken} aria-label="Spoken">
            <MicIcon size={12} />
          </span>
        )}
        {turn.heard?.length ? <HeardParts parts={turn.heard} /> : turn.instruction}
      </div>
      {turn.status === "working" ? (
        <Thinking turn={turn} />
      ) : (
        <Answer turn={turn} canUndo={canUndo} busy={busy} onUndo={onUndo} onChoose={onChoose} />
      )}
    </li>
  );
}

/** A take in order: what was said, with a ♪ chip where they sang. */
function HeardParts({ parts }: { parts: TakePart[] }) {
  return parts.map((part, i) =>
    part.kind === "said" ? (
      <span key={i}>{part.text} </span>
    ) : (
      <span key={i} className={styles.sungChip} aria-label={`sang ${sungLength(part.seconds)}`}>
        ♪ {sungLength(part.seconds)}
      </span>
    ),
  );
}

function Thinking({ turn }: { turn: Turn }) {
  const line = useActivityLine(turn.activity);
  return (
    <div className={`${styles.theirs} ${styles.thinking}`} role="status">
      <span className={styles.dots} aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span key={line} className={styles.activity}>
        {line}…
      </span>
    </div>
  );
}

function Answer({ turn, canUndo, busy, onUndo, onChoose }: Omit<TurnBubblesProps, "turn"> & { turn: Turn }) {
  const failed = turn.status === "failed";
  return (
    <div className={failed ? `${styles.theirs} ${styles.failed}` : styles.theirs}>
      <p>{turn.reply}</p>
      {turn.changes && turn.changes.length > 0 && (
        <ul className={styles.changes} aria-label="Changes">
          {turn.changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      )}
      {(turn.question || canUndo) && (
        <div className={styles.actions}>
          {turn.question?.choices.map((choice) => (
            <button key={choice} disabled={busy} onClick={() => onChoose(choice)}>
              {choice}
            </button>
          ))}
          {canUndo && (
            <button className={styles.undo} onClick={onUndo}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
