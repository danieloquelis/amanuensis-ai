import { ScoreSurface, type ScoreEditor } from "@/modules/editor/ui";
import styles from "./workspace.module.css";

/** The paper: title, tempo marking, the editable sheet and footer. */
export function ScoreCanvas({
  editor,
  playBeat,
  zoom,
}: {
  editor: ScoreEditor;
  playBeat: number | null;
  zoom: number;
}) {
  const { score, ready, commit } = editor;
  const barCount = score.measures.length;
  return (
    <div className={styles.canvas}>
      <div className={styles.canvasTop}>
        <span>
          <span className={styles.statusDot} /> {editor.saveStatus}
        </span>
        <span>{barCount} measures · Reference tone</span>
      </div>
      <article className={styles.paper} style={{ width: `${zoom}%` }} aria-label="Music sheet">
        <div className={styles.paperTop}>
          <span>AMANUENSIS / NO. 001</span>
          <span>FOR SOLO MELODY</span>
        </div>
        <div className={styles.scoreHeading}>
          <input
            key={`${score.id}-${score.title}`}
            aria-label="Score title"
            className={styles.titleInput}
            defaultValue={score.title}
            maxLength={100}
            disabled={!ready}
            onBlur={(event) => {
              const title = event.target.value;
              if (title.trim() !== score.title) commit({ type: "rename", title }, "Renamed the score");
              if (!title.trim()) event.target.value = score.title;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          {/* The input is hidden in print; this heading replaces it. */}
          <h1 className={styles.printTitle}>{score.title}</h1>
        </div>
        <div className={styles.scoreMeta}>
          <span>
            Tempo <span className={styles.tempoMark}>♩ = {score.tempo}</span>
          </span>
          <span>Melody</span>
        </div>
        <ScoreSurface
          score={score}
          selectedId={editor.selectedId}
          playBeat={playBeat}
          onSelect={editor.select}
          selectedBarId={editor.selectedBarId}
          onSelectBar={editor.selectBar}
          onDeleteBar={editor.deleteBar}
          selectedItem={editor.selectedItem}
          onSelectItem={editor.selectItem}
          onDeleteItem={editor.deleteItem}
          onCommand={commit}
          interactive={ready}
          onStep={editor.stepPitch}
          onDelete={(id) => commit({ type: "removeEvent", eventId: id }, "Removed note")}
          onEnterLetter={editor.enterLetter}
          onToggleRest={editor.toggleRest}
          picked={editor.picked}
          onPick={editor.pick}
          onFocusEvent={editor.focusEvent}
        />
        <div className={styles.paperFooter}>
          <span>{barCount} measures · Treble clef</span>
          <span>{String(barCount).padStart(2, "0")} BARS</span>
        </div>
      </article>
    </div>
  );
}
