import type { Selection } from "@/modules/editor";
import { pitchName, type Score } from "@/modules/score";
import styles from "./workspace.module.css";

function statusMessage(playing: boolean, selection: Selection | null) {
  if (playing) return "Playing · press Esc to stop";
  if (selection) return `Bar ${selection.measureIndex + 1} · ${pitchName(selection.event.pitch)}`;
  return "Select a note or bar to edit";
}

export function StatusBar({
  score,
  selection,
  playing,
}: {
  score: Score;
  selection: Selection | null;
  playing: boolean;
}) {
  return (
    <footer className={styles.statusBar}>
      <span>
        <span className={styles.statusDot} /> LOCAL WORKSPACE
      </span>
      <span aria-live="polite">{statusMessage(playing, selection)}</span>
      <span>REV {String(score.revision).padStart(3, "0")}</span>
    </footer>
  );
}
