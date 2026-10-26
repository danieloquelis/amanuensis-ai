import { useState } from "react";
import { DYNAMICS, type Annotation } from "@/modules/score";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

/** Edit a text indication in place, switch a dynamic, or remove either. */
export function IndicationMenuSection({ annotation, commit }: { annotation: Annotation; commit: CheckedCommit }) {
  const [text, setText] = useState(annotation.text);
  return (
    <>
      {annotation.kind === "text" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit({ type: "putAnnotation", ...annotation, text }, "Edited indication");
          }}
        >
          <input
            autoComplete="off"
            aria-label="Indication text"
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={styles.action} disabled={!text.trim()}>
            Save text
          </button>
        </form>
      ) : (
        <div className={styles.row}>
          {DYNAMICS.map((dynamic) => (
            <button
              key={dynamic}
              onClick={() => commit({ type: "putAnnotation", ...annotation, text: dynamic }, "Changed dynamic")}
            >
              {dynamic}
            </button>
          ))}
        </div>
      )}
      <button
        className={styles.action}
        onClick={() => commit({ type: "removeNotation", id: annotation.id }, "Removed indication")}
      >
        Remove indication
      </button>
    </>
  );
}
