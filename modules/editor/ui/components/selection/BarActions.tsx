import { ColumnsPlusRight, Copy, Eraser, Metronome, StackMinus, StackPlus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { isDrumKit, TEMPO_RANGE, type Measure, type Score } from "@/modules/score";
import { IconButton } from "@/shared/ui/IconButton";
import { hasSecondVoice, secondVoiceEdit } from "../../../application/voice-edits";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import styles from "./selection.module.css";

/**
 * The selected bar: insert one after it, duplicate, add or remove a second voice, clear or delete
 * it. Picked in one instrument's lane, the voice and clear act on that staff only; the bar itself
 * (insert, duplicate, delete) is shared by every instrument.
 */
export function BarActions({ editor, measure }: { editor: ScoreEditor; measure: Measure }) {
  const { commit } = editor;
  const staffId = editor.selectedStaffId ?? undefined;
  const voiceEdit = secondVoiceEdit(editor.score, measure.id, staffId);
  const twoVoices = hasSecondVoice(editor.score, measure.id, staffId);
  // On a drum staff the second voice is the feet (kick, hi-hat pedal); a bar may go without it.
  const voiceName = onDrumStaff(editor.score, staffId) ? "feet voice" : "second voice";
  const voiceLabel = twoVoices ? `Remove ${voiceName}` : `Add ${voiceName}`;
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
        {twoVoices ? <StackMinus size={19} /> : <StackPlus size={19} />}
      </IconButton>
      <IconButton
        label="Clear bar"
        tooltip="Clear bar"
        onClick={() => commit({ type: "clearMeasure", measureId: measure.id, staffId }, "Cleared bar")}
      >
        <Eraser size={19} />
      </IconButton>
      <IconButton label="Delete bar" tooltip="Delete bar" shortcut="⌫" onClick={() => editor.deleteBar(measure.id)}>
        <Trash size={19} />
      </IconButton>
      <BarTempo key={`${measure.id}-${measure.tempo ?? ""}`} editor={editor} measure={measure} />
    </div>
  );
}

/** The lane's staff is a drum kit's (with no lane picked, the first staff). */
const onDrumStaff = (score: Score, staffId: string | undefined) => {
  const part = staffId ? score.parts.find((p) => p.staves.some((s) => s.id === staffId)) : score.parts[0];
  return !!part && isDrumKit(part.instrument);
};

/**
 * A tempo change from this bar on: a metronome that opens a small field for the new tempo,
 * committed on Enter or when leaving it; emptied, the bar follows the tempo before it again. The
 * metronome is lit when this bar changes the tempo.
 */
function BarTempo({ editor, measure }: { editor: ScoreEditor; measure: Measure }) {
  const [open, setOpen] = useState(false);
  const label = measure.tempo ? `Tempo ${measure.tempo} from this bar` : "Tempo change from this bar";
  const save = (value: string) => {
    setOpen(false);
    if (value === String(measure.tempo ?? "")) return;
    if (!value) editor.commit({ type: "removeTempo", measureId: measure.id }, "Removed tempo change");
    else
      editor.commit({ type: "setTempo", measureId: measure.id, tempo: Number(value) }, `Tempo ${value} from this bar`);
  };
  if (!open) {
    return (
      <IconButton label={label} tooltip={label} aria-pressed={!!measure.tempo} onClick={() => setOpen(true)}>
        <Metronome size={19} />
      </IconButton>
    );
  }
  return (
    <label className={styles.barTempo} title="Tempo from this bar">
      <Metronome size={17} aria-hidden />
      <input
        aria-label="Tempo from this bar"
        type="number"
        min={TEMPO_RANGE.min}
        max={TEMPO_RANGE.max}
        placeholder="♩"
        autoFocus
        defaultValue={measure.tempo ?? ""}
        onBlur={(e) => save(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
    </label>
  );
}
