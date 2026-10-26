import { useState } from "react";
import { KEY_FIFTHS, keyName, scoreKey, type KeySignature, type Score } from "@/modules/score";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./toolbar.module.css";

const FIFTHS = Array.from({ length: KEY_FIFTHS.max - KEY_FIFTHS.min + 1 }, (_, i) => KEY_FIFTHS.min + i);

/** Short trigger label: "C", "B♭", "F♯m". */
export function keyLabel(key: KeySignature): string {
  const [tonic] = keyName(key).split(" ");
  return key.mode === "minor" ? `${tonic}m` : tonic;
}

/** Major/minor toggle and one button per key; a click applies it to the whole score. */
export function KeyGrid({ score, onCommand }: { score: Score; onCommand: CommitEdit }) {
  const current = scoreKey(score);
  const [mode, setMode] = useState(current.mode);
  return (
    <>
      <div className={styles.segmented} role="group" aria-label="Key mode">
        {(["major", "minor"] as const).map((value) => (
          <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {value === "major" ? "Major" : "Minor"}
          </button>
        ))}
      </div>
      <div className={`${styles.grid} ${styles.wideGrid}`} role="group" aria-label="Key signature">
        {FIFTHS.map((fifths) => {
          const key: KeySignature = { fifths, mode };
          const active = fifths === current.fifths && mode === current.mode;
          return (
            <button
              key={fifths}
              aria-label={keyName(key)}
              aria-pressed={active}
              onClick={() => !active && onCommand({ type: "setKey", key }, `Key: ${keyName(key)}`)}
            >
              {keyLabel(key)}
            </button>
          );
        })}
      </div>
    </>
  );
}
