import { useState } from "react";
import type { Score } from "@/modules/score";
import type { Selection } from "../../../application/selection";
import { useIndicationAnchor, type AnchorKind } from "../../hooks/use-indication-anchor";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { AnchorSelect } from "./AnchorSelect";
import styles from "./toolbar.module.css";

type TextIndicationToolsProps = {
  score: Score;
  selection: Selection | null;
  measureIndex: number;
  onCommand: CommitEdit;
};

/** Add, edit and remove free-text indications. Text is printed context, never an instruction. */
export function TextIndicationTools({ score, selection, measureIndex, onCommand }: TextIndicationToolsProps) {
  const { anchor, setAnchor, targetId, anchored, subject } = useIndicationAnchor(score, selection, measureIndex);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const texts = anchored.filter((a) => a.kind === "text");

  const resetForm = () => {
    setText("");
    setEditingId(null);
  };
  const changeAnchor = (next: AnchorKind) => {
    setAnchor(next);
    resetForm();
  };

  return (
    <section>
      <h2>Text indication · {subject}</h2>
      <AnchorSelect anchor={anchor} hasSelection={!!selection} measureIndex={measureIndex} onChange={changeAnchor} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCommand(
            { type: "putAnnotation", ...(editingId ? { id: editingId } : {}), targetId, kind: "text", text },
            editingId ? "Updated indication" : "Added text indication",
          );
          resetForm();
        }}
      >
        <label>
          Text indication
          <input
            aria-label="Text indication"
            placeholder="dolce, espressivo, breathe…"
            maxLength={120}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button disabled={!text.trim()}>{editingId ? "Update text" : "Add text"}</button>
      </form>
      {texts.map((a) => (
        <div className={styles.item} key={a.id}>
          <span>{a.text}</span>
          <div>
            <button
              onClick={() => {
                setEditingId(a.id);
                setText(a.text);
              }}
            >
              Edit
            </button>
            <button
              aria-label={`Remove indication ${a.text}`}
              onClick={() => {
                onCommand({ type: "removeNotation", id: a.id }, "Removed indication");
                if (editingId === a.id) resetForm();
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
