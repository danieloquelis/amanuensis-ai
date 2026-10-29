import { Play, Stop } from "@phosphor-icons/react";
import type { ScoreEditor } from "@/modules/editor/ui";
import { TEMPO_RANGE } from "@/modules/score";
import styles from "./workspace.module.css";

type PlaybackControlsProps = {
  editor: ScoreEditor;
  playing: boolean;
  /** The bar playback starts from when something is selected; null plays from the beginning. */
  startBar: number | null;
  onTogglePlay: () => void;
};

/** Play/stop and the global tempo, first in the toolbar: listen, then edit. */
export function PlaybackControls({ editor, playing, startBar, onTogglePlay }: PlaybackControlsProps) {
  const fromBar = !playing && startBar !== null;
  return (
    <div className={styles.transport} role="group" aria-label="Playback">
      <button
        type="button"
        className={styles.play}
        data-playing={playing}
        disabled={!editor.ready}
        onClick={onTogglePlay}
        aria-label={playing ? "Stop playback" : fromBar ? `Play from bar ${startBar}` : "Play score"}
      >
        {playing ? <Stop size={18} weight="fill" /> : <Play size={18} weight="fill" />}
      </button>
      <TempoField editor={editor} />
    </div>
  );
}

/**
 * Global tempo, shown like the other tools (value over name) and edited in place: committed on
 * blur or Enter; invalid input snaps back to the current tempo.
 */
function TempoField({ editor }: { editor: ScoreEditor }) {
  const { score, ready, commit } = editor;
  const isValid = (tempo: number) => Number.isInteger(tempo) && tempo >= TEMPO_RANGE.min && tempo <= TEMPO_RANGE.max;
  return (
    <label className={styles.tempo}>
      <input
        key={score.tempo}
        type="number"
        min={TEMPO_RANGE.min}
        max={TEMPO_RANGE.max}
        defaultValue={score.tempo}
        disabled={!ready}
        aria-label="Tempo in beats per minute"
        onBlur={(event) => {
          const tempo = Number(event.target.value);
          if (tempo !== score.tempo) commit({ type: "setTempo", tempo }, `Set tempo to ${tempo} BPM`);
          event.target.value = String(isValid(tempo) ? tempo : score.tempo);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className={styles.tempoLabel}>Tempo</span>
    </label>
  );
}
