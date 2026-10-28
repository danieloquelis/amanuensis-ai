import type { Selection } from "@/modules/editor";
import { pitchName, type Score } from "@/modules/score";
import styles from "./workspace.module.css";

function statusMessage(playing: boolean, selection: Selection | null, pickedName: string | null) {
  if (playing) return "Playing · press Esc to stop";
  if (pickedName) return `${pickedName} selected · ⌘K to ask the assistant`;
  if (selection) return `Bar ${selection.measureIndex + 1} · ${pitchName(selection.event.pitch)}`;
  return "Select a note or bar to edit";
}

export function StatusBar({
  score,
  selection,
  pickedName,
  playing,
  saveStatus,
}: {
  score: Score;
  selection: Selection | null;
  /** The name of a multiple selection ("Bars 3–6"); null for one item or none. */
  pickedName: string | null;
  playing: boolean;
  /** Whether the score is saved on this device ("Saved on this device", "Not saved…"). */
  saveStatus: string;
}) {
  return (
    <footer className={styles.statusBar}>
      <span>
        <span className={styles.statusDot} /> {saveStatus}
      </span>
      <span aria-live="polite">{statusMessage(playing, selection, pickedName)}</span>
      <span>REV {String(score.revision).padStart(3, "0")}</span>
    </footer>
  );
}
