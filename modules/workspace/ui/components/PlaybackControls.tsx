import { Play, Stop } from "@phosphor-icons/react";
import { MixerTool, type ScoreEditor } from "@/modules/editor/ui";
import { TEMPO_RANGE } from "@/modules/score";
import styles from "./workspace.module.css";

type PlaybackControlsProps = {
  editor: ScoreEditor;
  playing: boolean;
  /** Instrument sounds are loading before the first note. */
  loading: boolean;
  /** The bar playback starts from when something is selected; null plays from the beginning. */
  startBar: number | null;
  /** The assistant is writing: the score isn't final, so it can't be started (a playing score can still be stopped). */
  working: boolean;
  onTogglePlay: () => void;
};

/** Play/stop, the global tempo and (with several parts) the mixer, first in the toolbar: listen, then edit. */
export function PlaybackControls({ editor, playing, loading, startBar, working, onTogglePlay }: PlaybackControlsProps) {
  const fromBar = !playing && startBar !== null;
  const label = loading
    ? "Loading sounds"
    : playing
      ? "Stop playback"
      : working
        ? "Play is available once the assistant is done"
        : fromBar
          ? `Play from bar ${startBar}`
          : "Play score";
  return (
    <div className={styles.transport} role="group" aria-label="Playback">
      <button
        type="button"
        className={styles.play}
        data-playing={playing}
        disabled={!editor.loaded || (working && !playing)}
        onClick={onTogglePlay}
        aria-busy={loading}
        aria-label={label}
      >
        {playing ? <Stop size={18} weight="fill" /> : <Play size={18} weight="fill" />}
      </button>
      <TempoField editor={editor} />
      <MixerTool editor={editor} />
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
