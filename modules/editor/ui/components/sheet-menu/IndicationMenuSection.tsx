import { DYNAMICS, type Annotation } from "@/modules/score";
import { LabelMenuSection } from "./LabelMenuSection";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

/** Edit a text indication in place, switch a dynamic, or remove either. Drag on the sheet to move. */
export function IndicationMenuSection({ annotation, commit }: { annotation: Annotation; commit: CheckedCommit }) {
  const remove = { type: "removeNotation", id: annotation.id } as const;
  if (annotation.kind === "text") {
    return (
      <LabelMenuSection
        ariaLabel="Indication text"
        initial={annotation.text}
        maxLength={120}
        commit={commit}
        save={(text) => ({ type: "putAnnotation", ...annotation, text })}
        remove={remove}
      />
    );
  }
  return (
    <>
      <div className={styles.row}>
        {DYNAMICS.map((dynamic) => (
          <button
            key={dynamic}
            aria-pressed={annotation.text === dynamic}
            onClick={() => commit({ type: "putAnnotation", ...annotation, text: dynamic }, "Changed dynamic")}
          >
            {dynamic}
          </button>
        ))}
      </div>
      <button className={styles.action} onClick={() => commit(remove, "Removed dynamic")}>
        Remove
      </button>
    </>
  );
}
