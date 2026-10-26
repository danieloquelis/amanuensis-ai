"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScoreToolMenus } from "@/modules/editor/ui/ScoreToolMenus";
import { useScoreEditor } from "@/modules/editor/application/use-score-editor";
import { ScoreSurface } from "@/modules/engraving/ui/ScoreSurface";
import { AudioPlayer } from "@/modules/playback/infrastructure/audio-player";
import { downloadProject, localProjectRepository } from "@/modules/projects/infrastructure/local-project";
import { pitchName } from "@/modules/score";
import { Icon } from "@/shared/ui/Icon";
import styles from "./workspace.module.css";

export function WorkspaceScreen() {
  const player = useRef<AudioPlayer | null>(null);
  const [playBeat, setPlayBeat] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(100);
  const fileInput = useRef<HTMLInputElement>(null);
  const stop = useCallback(() => { player.current?.stop(); setPlayBeat(null); setPlaying(false); }, []);
  const editor = useScoreEditor(stop, localProjectRepository);
  const { score, selection, ready, commit, undoRedo } = editor;

  useEffect(() => {
    const audio = new AudioPlayer(); player.current = audio;
    const handleHidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", handleHidden);
    return () => { document.removeEventListener("visibilitychange", handleHidden); audio.dispose(); };
  }, [stop]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); undoRedo(event.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stop, undoRedo]);

  const play = async () => {
    if (playing) { stop(); return; }
    try {
      setPlaying(true);
      await player.current?.play(score, (beat) => { setPlayBeat(beat); if (beat === null) setPlaying(false); });
    } catch { stop(); editor.setError("Playback could not start. Check this browser's audio permissions and try again."); }
  };

  return <div className={styles.app}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Amanuensis home"><span className={styles.brandMark}><Icon name="music" size={20} /></span><span>amanuensis<span className={styles.ai}>AI</span></span></Link>
      <div className={styles.breadcrumb}>Workspace <span>/</span> <strong>{score.title}</strong></div>
      <div className={styles.headerRight}><span className={styles.edition}>EARLY STUDIO</span><span className={styles.avatar} title="Local workspace">a.</span></div>
    </header>
    <main className={styles.main}>
      <section className={styles.studio} aria-label="Score workspace">
        <div className={styles.toolbar}>
          <div className={styles.documentLabel}><span className={styles.smallIcon}><Icon name="note" size={16} /></span><span>Score editor</span><span className={styles.badge}>MELODY</span></div>
          <div className={styles.fileActions}>
            <button disabled={!ready} onClick={() => fileInput.current?.click()} title="Open an Amanuensis JSON score"><Icon name="upload" size={15} /><span>Open</span></button>
            <button disabled={!ready} onClick={() => downloadProject(score)}><Icon name="download" size={15} /><span>Save a copy</span></button>
            <button disabled={!ready} onClick={() => window.print()} title="Print score or save as PDF" aria-label="Print score"><Icon name="print" size={16} /></button>
            <input className={styles.fileInput} type="file" accept=".json,application/json" ref={fileInput} aria-label="Open score file" onChange={async (event) => {
              const file = event.target.files?.[0]; event.target.value = "";
              if (!file) return;
              try {
                if (file.size > 1_000_000) throw new Error("Choose an Amanuensis score smaller than 1 MB.");
                editor.replace(JSON.parse(await file.text()));
              } catch (error) { editor.setError(error instanceof Error ? error.message : "That score could not be opened."); }
            }} />
          </div>
        </div>
        <div className={styles.transport}>
          <div className={styles.playback}>
            <button className={styles.play} disabled={!ready} onClick={play} aria-label={playing ? "Stop playback" : "Play score"}><Icon name={playing ? "stop" : "play"} size={15} /><span>{playing ? "Stop" : "Play"}</span></button>
            <span className={styles.separator} />
            <label className={styles.tempo}><span aria-hidden="true">♩</span><input key={score.tempo} type="number" min={40} max={200} defaultValue={score.tempo} disabled={!ready} aria-label="Tempo in beats per minute" onBlur={(event) => {
              const tempo = Number(event.target.value);
              if (tempo !== score.tempo) commit({ type: "setTempo", tempo }, `Set tempo to ${tempo} BPM`);
              event.target.value = String(Number.isInteger(tempo) && tempo >= 40 && tempo <= 200 ? tempo : score.tempo);
            }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>BPM</small></label>
            <span className={styles.separator} /><ScoreToolMenus score={score} selection={selection} ready={ready} onCommand={commit} onError={editor.setError} />
          </div>
          <div className={styles.editActions}>
            <button aria-label="Undo" title="Undo (⌘/Ctrl Z)" disabled={!ready || !editor.canUndo} onClick={() => undoRedo("undo")}><Icon name="undo" size={16} /></button>
            <button aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)" disabled={!ready || !editor.canRedo} onClick={() => undoRedo("redo")}><Icon name="redo" size={16} /></button>
            <span className={styles.separator} />
            <select aria-label="Score zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[80, 100, 125, 150].map((value) => <option key={value} value={value}>{value}%</option>)}</select>
          </div>
        </div>
        {editor.error && <div className={styles.error} role="alert"><span>{editor.error}</span><button aria-label="Dismiss message" onClick={() => editor.setError(null)}><Icon name="close" size={16} /></button></div>}
        <div className={styles.canvas}>
          <div className={styles.canvasTop}><span><span className={styles.statusDot} /> {editor.saveStatus}</span><span>{score.measures.length} measures · Reference tone</span></div>
          <article className={styles.paper} style={{ width: `${zoom}%` }} aria-label="Music sheet">
            <div className={styles.paperTop}><span>AMANUENSIS / NO. 001</span><span>FOR SOLO MELODY</span></div>
            <div className={styles.scoreHeading}>
              <input key={`${score.id}-${score.title}`} aria-label="Score title" className={styles.titleInput} defaultValue={score.title} maxLength={100} disabled={!ready} onBlur={(event) => {
                if (event.target.value.trim() !== score.title) commit({ type: "rename", title: event.target.value }, "Renamed the score");
                if (!event.target.value.trim()) event.target.value = score.title;
              }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              <h1 className={styles.printTitle}>{score.title}</h1>

            </div>
            <div className={styles.scoreMeta}><span>Tempo <span className={styles.tempoMark}>♩ = {score.tempo}</span></span><span>Melody</span></div>
            <ScoreSurface score={score} selectedId={editor.selectedId} playBeat={playBeat} onSelect={editor.select}
              onCommand={commit} interactive={ready}
              onStep={editor.step} onDelete={(id) => commit({ type: "removeEvent", eventId: id }, "Removed note")} />
            <div className={styles.paperFooter}><span>{score.measures.length} measures · Treble clef</span><span>{String(score.measures.length).padStart(2, "0")} BARS</span></div>
          </article>

        </div>
        <footer className={styles.statusBar}><span><span className={styles.statusDot} /> LOCAL WORKSPACE</span><span aria-live="polite">{playing ? "Playing · press Esc to stop" : selection ? `Bar ${selection.measureIndex + 1} · ${pitchName(selection.event.pitch)}` : "Select a note or bar to edit"}</span><span>REV {String(score.revision).padStart(3, "0")}</span></footer>
      </section>
    </main>
  </div>;
}
