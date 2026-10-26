import { ScoreToolMenus, type ScoreEditor } from "@/modules/editor/ui";
import { TEMPO_RANGE } from "@/modules/score";
import { Icon } from "@/shared/ui/Icon";
import styles from "./workspace.module.css";

const ZOOM_LEVELS = [80, 100, 125, 150];

type TransportBarProps = {
  editor: ScoreEditor;
  playing: boolean;
  onTogglePlay: () => void;
  zoom: number;
  onZoom: (zoom: number) => void;
};

/** Play/stop, global tempo, notation tools, undo/redo and zoom. */
export function TransportBar({ editor, playing, onTogglePlay, zoom, onZoom }: TransportBarProps) {
  const { ready, undoRedo } = editor;
  return (
    <div className={styles.transport}>
      <div className={styles.playback}>
        <button
          className={styles.play}
          disabled={!ready}
          onClick={onTogglePlay}
          aria-label={playing ? "Stop playback" : "Play score"}
        >
          <Icon name={playing ? "stop" : "play"} size={15} />
          <span>{playing ? "Stop" : "Play"}</span>
        </button>
        <span className={styles.separator} />
        <TempoField editor={editor} />
        <span className={styles.separator} />
        <ScoreToolMenus
          score={editor.score}
          selection={editor.selection}
          ready={ready}
          onCommand={editor.commit}
          onError={editor.setError}
        />
      </div>
      <div className={styles.editActions}>
        <button
          aria-label="Undo"
          title="Undo (⌘/Ctrl Z)"
          disabled={!ready || !editor.canUndo}
          onClick={() => undoRedo("undo")}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          aria-label="Redo"
          title="Redo (⌘/Ctrl Shift Z)"
          disabled={!ready || !editor.canRedo}
          onClick={() => undoRedo("redo")}
        >
          <Icon name="redo" size={16} />
        </button>
        <span className={styles.separator} />
        <select aria-label="Score zoom" value={zoom} onChange={(event) => onZoom(Number(event.target.value))}>
          {ZOOM_LEVELS.map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Global tempo, committed on blur or Enter; invalid input snaps back to the current tempo. */
function TempoField({ editor }: { editor: ScoreEditor }) {
  const { score, ready, commit } = editor;
  const isValid = (tempo: number) => Number.isInteger(tempo) && tempo >= TEMPO_RANGE.min && tempo <= TEMPO_RANGE.max;
  return (
    <label className={styles.tempo}>
      <span aria-hidden="true">♩</span>
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
      <small>BPM</small>
    </label>
  );
}
