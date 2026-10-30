import { StackMinus, StackPlus } from "@phosphor-icons/react";
import { eventPitches, findEvent, scoreKey, voiceInfo, type Score, type ScoreEvent } from "@/modules/score";
import { IconButton } from "@/shared/ui/IconButton";
import { addChordNoteEdit, removeTopNoteEdit } from "../../../application/chord-edits";
import { toggleRestOperation } from "../../../application/note-edits";
import { hasSecondVoice, secondVoiceEdit } from "../../../application/voice-edits";
import { ChordNoteIcon, RestIcon } from "./MenuIcons";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

const ICON = 22;

/**
 * Right-click on a note: what the selection card does not offer, as icons named by their native
 * title (a drawn tooltip would hang out of the scrolling menu). Stack a note on the
 * chord or take its top note off, make the note a rest, add or remove the bar's second voice.
 */
export function NoteMenuSection({ score, event, commit }: { score: Score; event: ScoreEvent; commit: CheckedCommit }) {
  const found = findEvent(score, event.id);
  const measureId = found?.measure.id;
  // The second voice goes on the note's own staff.
  const staffId = found ? voiceInfo(score, found.voiceId)?.staff.id : undefined;
  const addNote = addChordNoteEdit(score, event.id);
  const removeTop = removeTopNoteEdit(score, event.id);
  const voice = measureId ? secondVoiceEdit(score, measureId, staffId) : null;
  const twoVoices = measureId && hasSecondVoice(score, measureId, staffId);
  const voiceLabel = twoVoices ? "Remove second voice" : "Add second voice";
  return (
    <div className={styles.row} role="group" aria-label="Note">
      {addNote && (
        <IconButton
          label="Add note to chord"
          title="Add note to chord"
          onClick={() => commit(addNote.operation, addNote.receipt)}
        >
          <ChordNoteIcon size={ICON} change="add" />
        </IconButton>
      )}
      {removeTop && (
        <IconButton
          label="Remove top note"
          title="Remove top note"
          onClick={() => commit(removeTop.operation, removeTop.receipt)}
        >
          <ChordNoteIcon size={ICON} change="remove" />
        </IconButton>
      )}
      {eventPitches(event).length > 0 && (
        <IconButton
          label="Make rest"
          title="Make rest"
          onClick={() => commit(toggleRestOperation(event, scoreKey(score)), "Replaced note with rest")}
        >
          <RestIcon size={ICON} />
        </IconButton>
      )}
      {voice && (
        <IconButton label={voiceLabel} title={voiceLabel} onClick={() => commit(voice.operation, voice.receipt)}>
          {voiceLabel.startsWith("Remove") ? <StackMinus size={ICON} /> : <StackPlus size={ICON} />}
        </IconButton>
      )}
    </div>
  );
}
