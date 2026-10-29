import { ColumnsPlusRight, Copy, Eraser, Trash } from "@phosphor-icons/react";
import type { Measure } from "@/modules/score";
import { IconButton } from "@/shared/ui/IconButton";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import styles from "./selection.module.css";

/** The selected bar: insert one after it, duplicate, clear or delete it. */
export function BarActions({ editor, measure }: { editor: ScoreEditor; measure: Measure }) {
  const { commit } = editor;
  return (
    <div className={styles.actions} role="toolbar" aria-label="Selected bar actions">
      <IconButton
        label="Insert bar after"
        tooltip="Insert bar after"
        onClick={() => commit({ type: "appendMeasure", afterMeasureId: measure.id }, "Inserted bar")}
      >
        <ColumnsPlusRight size={19} />
      </IconButton>
      <IconButton
        label="Duplicate bar"
        tooltip="Duplicate bar"
        onClick={() => commit({ type: "duplicateMeasure", measureId: measure.id }, "Duplicated bar")}
      >
        <Copy size={19} />
      </IconButton>
      <IconButton
        label="Clear bar"
        tooltip="Clear bar"
        onClick={() => commit({ type: "clearMeasure", measureId: measure.id }, "Cleared bar")}
      >
        <Eraser size={19} />
      </IconButton>
      <IconButton label="Delete bar" tooltip="Delete bar" shortcut="⌫" onClick={() => editor.deleteBar(measure.id)}>
        <Trash size={19} />
      </IconButton>
    </div>
  );
}
