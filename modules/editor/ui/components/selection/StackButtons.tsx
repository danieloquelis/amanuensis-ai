import type { ScoreEvent } from "@/modules/score";
import { addChordNoteEdit, removeTopNoteEdit } from "../../../application/chord-edits";
import { removeHeadEdit } from "../../../application/head-edits";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import { ChordNoteIcon, RestIcon } from "../sheet-menu/MenuIcons";
import styles from "./selection.module.css";

const ICON = 20;

/**
 * The stem of a note or drum hit: another note on it (a third above; for drums the piece that goes
 * with it: a snare under a hi-hat), and taking one off (the picked head, or else the top one).
 */
export function StackButtons({ editor, event, head }: { editor: ScoreEditor; event: ScoreEvent; head: number | null }) {
  const add = addChordNoteEdit(editor.score, event.id);
  const remove =
    head !== null ? removeHeadEdit(editor.score, event.id, head) : removeTopNoteEdit(editor.score, event.id);
  const thing = event.drums ? "drum" : "note";
  const removeLabel = head !== null ? `Remove this ${thing}` : `Remove the top ${thing}`;
  return (
    <div role="group" aria-label="Stem" className={styles.endGroup}>
      {add && (
        <button
          className={styles.action}
          aria-label={`Add a ${thing} on this stem`}
          title={`Add a ${thing} on this stem`}
          onClick={() => editor.commit(add.operation, add.receipt)}
        >
          <ChordNoteIcon size={ICON} change="add" />
        </button>
      )}
      {remove ? (
        <button
          className={styles.action}
          aria-label={removeLabel}
          title={removeLabel}
          onClick={() => {
            editor.commit(remove.operation, remove.receipt);
            editor.select(event.id);
          }}
        >
          <ChordNoteIcon size={ICON} change="remove" />
        </button>
      ) : (
        // Its place is kept, so the card does not change width when a note is added.
        <span className={styles.slot} aria-hidden />
      )}
    </div>
  );
}

/** Makes the whole stem a rest of the same length: with the rhythm, since a rest is a length without a sound. */
export function MakeRestButton({ editor, event }: { editor: ScoreEditor; event: ScoreEvent }) {
  return (
    <div role="group" aria-label="Rest" className={styles.endGroup}>
      <button
        className={styles.action}
        aria-label="Make rest"
        title="Make rest"
        onClick={() => editor.toggleRest(event.id)}
      >
        <RestIcon size={ICON} />
      </button>
      {/* The stem column below has two places: the rest keeps the second free, so they line up. */}
      <span className={styles.slot} aria-hidden />
    </div>
  );
}
