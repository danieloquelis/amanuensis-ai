import type { usePendingChange } from "../../hooks/use-pending-change";
import styles from "./toolbar.module.css";

export function PendingChangePanel({ change }: { change: ReturnType<typeof usePendingChange> }) {
  const { pending, isStale, apply, discard } = change;
  if (!pending) return null;
  return (
    <div className={styles.preview} role="status">
      <strong>{pending.description}</strong>
      {isStale ? (
        <p>Score changed. Preview again before applying.</p>
      ) : (
        <p>One undoable edit. The original is unchanged until you apply.</p>
      )}
      <div className={styles.actions}>
        <button disabled={isStale} onClick={apply}>
          Apply change
        </button>
        <button onClick={discard}>Cancel</button>
      </div>
    </div>
  );
}
