import type { Score, Step } from "@/modules/score";
import { typedLetterEdit } from "../../application/chord-edits";
import { letterHeadEdit, removeHeadEdit, stepHeadEdit } from "../../application/head-edits";
import { stepPitchEdit, toggleRestEdit } from "../../application/note-edits";
import type { CommitEdit } from "./use-score-editor";

type Picked = {
  selectedId: string | null;
  /** The head picked on that note's stem, or null for the whole stem. */
  selectedHead: number | null;
  select: (id: string | null, head?: number) => void;
};

/**
 * The keys and buttons that change a selected note or rest. With one head of a stem picked (a note
 * of a chord, a piece of a drum hit), they change that head only and keep it selected; otherwise
 * the whole stem: A–G name its pitch, ↑/↓ step it, Delete makes it a rest, Add note brings it back.
 */
export function useNoteCommands(getScore: () => Score, commit: CommitEdit, picked: Picked) {
  const headOf = (eventId: string) => (picked.selectedId === eventId ? picked.selectedHead : null);
  /** Applies a head edit and keeps that head (where it moved to) selected. */
  const onHead = (
    eventId: string,
    result: { edit: { operation: Parameters<CommitEdit>[0]; receipt: string }; head: number } | null,
  ) => {
    if (!result) return false;
    commit(result.edit.operation, result.edit.receipt);
    picked.select(eventId, result.head);
    return true;
  };

  /** A–G; on a transposing part it names the written note. With Shift the note joins the stem. */
  const enterLetter = (eventId: string, step: Step, addToChord = false) => {
    const head = headOf(eventId);
    if (head !== null && !addToChord && onHead(eventId, letterHeadEdit(getScore(), eventId, head, step))) return;
    const edit = typedLetterEdit(getScore(), eventId, step, addToChord);
    if (edit) commit(edit.operation, edit.receipt);
  };

  const stepPitch = (eventId: string, steps: number) => {
    const head = headOf(eventId);
    if (head !== null && onHead(eventId, stepHeadEdit(getScore(), eventId, head, steps))) return;
    const edit = stepPitchEdit(getScore(), eventId, steps);
    if (edit) commit(edit.operation, edit.receipt);
  };

  /** Delete: the picked head comes off its stem (the stem stays selected); a whole stem becomes a rest. */
  const removeNote = (eventId: string) => {
    const head = headOf(eventId);
    const edit = head !== null ? removeHeadEdit(getScore(), eventId, head) : null;
    if (!edit) return commit({ type: "removeEvent", eventId }, "Removed note");
    commit(edit.operation, edit.receipt);
    picked.select(eventId);
  };

  const toggleRest = (eventId: string) => {
    const edit = toggleRestEdit(getScore(), eventId);
    commit(edit.operation, edit.receipt);
  };

  return { enterLetter, stepPitch, removeNote, toggleRest };
}
