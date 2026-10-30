import { useRef, type CSSProperties } from "react";
import { sheetHeading } from "@/modules/editor";
import { ScoreSurface, useTurnPreview, type ScoreEditor } from "@/modules/editor/ui";
import { TempoNote } from "@/modules/engraving/ui";
import type { TurnDraft } from "@/modules/editor";
import { tempoMarking, type Command } from "@/modules/score";
import { usePinchZoom } from "../hooks/use-pinch-zoom";
import styles from "./workspace.module.css";

/** The paper: title, tempo marking, the editable sheet and footer. */
export function ScoreCanvas({
  editor,
  playBeat,
  zoom,
  onZoom,
  onMenuOpenChange,
  onAudition,
  onPress,
  live,
  draft,
}: {
  editor: ScoreEditor;
  playBeat: number | null;
  /** Sheet size in percent; pinching the trackpad (or Ctrl/⌘ + wheel) changes it. */
  zoom: number;
  onZoom: (zoom: number) => void;
  onMenuOpenChange: (open: boolean) => void;
  onAudition: (eventId: string, midi: number) => void;
  /** Any press on the paper or around it, e.g. to fold the chat away. */
  onPress: () => void;
  /** The edits of the assistant turn running now, shown before it ends; null when none runs. */
  live: readonly Command[] | null;
  /** The bars it is writing right now, drawn before they are written. */
  draft: TurnDraft | null;
}) {
  const { ready, commit } = editor;
  // While the assistant works, the sheet shows its edits so far, arriving as they are made.
  const { score, arriving, working } = useTurnPreview(editor.score, live, draft);
  const barCount = score.measures.length;
  const marking = tempoMarking(score.tempo, score.measures[0].meter);
  const canvas = useRef<HTMLDivElement>(null);
  usePinchZoom(canvas, zoom, onZoom);
  return (
    <div ref={canvas} className={styles.canvas} onPointerDown={onPress}>
      <article className={styles.paper} style={{ "--zoom": zoom / 100 } as CSSProperties} aria-label="Music sheet">
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
            Tempo{" "}
            <span className={styles.tempoMark}>
              <TempoNote note={marking.note} /> = {marking.perMinute}
            </span>
          </span>
          <span>Melody</span>
        </div>
        <ScoreSurface
          score={score}
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
          onDelete={editor.removeNote}
          onEnterLetter={editor.enterLetter}
          onToggleRest={editor.toggleRest}
          picked={editor.picked}
          onPick={editor.pick}
          onFocusEvent={editor.focusEvent}
          onMenuOpenChange={onMenuOpenChange}
          onAudition={onAudition}
          working={working}
          arriving={arriving}
        />
        <div className={styles.paperFooter}>
          <span>
            {barCount} measures · {sheetHeading(score)}
          </span>
          <span>amanuensis</span>
        </div>
      </article>
    </div>
  );
}
