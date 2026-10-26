import { useState } from "react";
import { measureCapacity, type Operation, type Score } from "@/modules/score";
import { checkOperation } from "../../../application/operation-check";
import type { ToolTarget } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./toolbar.module.css";

/**
 * Type a chord and press Enter; the cursor moves to the next bar so a progression can be typed
 * in one go ("C ⏎ Am ⏎ F ⏎ G ⏎"). Tab skips a bar.
 */
export function ChordEntry({ score, target, onCommand }: { score: Score; target: ToolTarget; onCommand: CommitEdit }) {
  const [position, setPosition] = useState({ barIndex: target.barIndex, beat: target.beat });
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");
  const measure = score.measures[Math.min(position.barIndex, score.measures.length - 1)];
  const advance = () =>
    setPosition((p) => ({ barIndex: Math.min(p.barIndex + 1, score.measures.length - 1), beat: 0 }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!symbol.trim()) return advance();
        const operation: Operation = { type: "putChord", measureId: measure.id, beat: position.beat, symbol };
        const problem = checkOperation(score, operation);
        if (problem) return setError(problem);
        onCommand(operation, `Chord ${symbol}`);
        setSymbol("");
        setError("");
        advance();
      }}
    >
      <input
        className={styles.field}
        aria-label="Chord symbol"
        placeholder="C, Am7, F#m7b5, G/B…"
        maxLength={24}
        autoComplete="off"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || e.shiftKey) return;
          e.preventDefault();
          advance();
        }}
      />
      <p className={error ? styles.error : styles.fieldHint}>
        {error ||
          `Bar ${position.barIndex + 1}${position.beat > 0 && position.beat < measureCapacity(measure.meter) ? `, beat ${position.beat + 1}` : ""}`}
      </p>
    </form>
  );
}
