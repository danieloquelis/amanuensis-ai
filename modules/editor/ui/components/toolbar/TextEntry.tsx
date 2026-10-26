import { useState } from "react";
import type { ToolTarget } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./toolbar.module.css";

/** Type, press Enter: the text is placed at the selected note (drag it on the sheet to move it). */
export function TextEntry({
  target,
  onCommand,
  onDone,
}: {
  target: ToolTarget;
  onCommand: CommitEdit;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onCommand(
          { type: "putAnnotation", targetId: target.eventId ?? target.measureId, kind: "text", text },
          "Added text",
        );
        setText("");
        onDone();
      }}
    >
      <input
        className={styles.field}
        aria-label="Text indication"
        placeholder="dolce, espressivo…"
        maxLength={120}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  );
}
