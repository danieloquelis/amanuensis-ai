import { ColumnsPlusRight, Copy, Eraser, StackMinus, StackPlus, Trash } from "@phosphor-icons/react";
import type { Measure } from "@/modules/score";
import { IconButton } from "@/shared/ui/IconButton";
import { hasSecondVoice, secondVoiceEdit } from "../../../application/voice-edits";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import styles from "./selection.module.css";

/** The selected bar: insert one after it, duplicate, add or remove a second voice, clear or delete it. */
export function BarActions({ editor, measure }: { editor: ScoreEditor; measure: Measure }) {
  const { commit } = editor;
  const voiceEdit = secondVoiceEdit(editor.score, measure.id);
  const voiceLabel = hasSecondVoice(editor.score, measure.id) ? "Remove second voice" : "Add second voice";
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
        label={voiceLabel}
        tooltip={voiceLabel}
        onClick={() => commit(voiceEdit.operation, voiceEdit.receipt)}
      >
        {hasSecondVoice(editor.score, measure.id) ? <StackMinus size={19} /> : <StackPlus size={19} />}
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
