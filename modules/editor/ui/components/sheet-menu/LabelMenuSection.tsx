import { useState } from "react";
import type { Operation } from "@/modules/score";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

type LabelMenuSectionProps = {
  ariaLabel: string;
  initial: string;
  maxLength: number;
  commit: CheckedCommit;
  save: (text: string) => Operation;
  remove: Operation;
};

/** Edit a label in place: Enter saves, an empty value removes it. */
export function LabelMenuSection({ ariaLabel, initial, maxLength, commit, save, remove }: LabelMenuSectionProps) {
  const [text, setText] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit(text.trim() ? save(text) : remove, text.trim() ? "Edited" : "Removed");
      }}
    >
      <input
        autoComplete="off"
        aria-label={ariaLabel}
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className={styles.action} onClick={() => commit(remove, "Removed")}>
        Remove
      </button>
    </form>
  );
}
