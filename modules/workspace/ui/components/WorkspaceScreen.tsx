"use client";

import { useState } from "react";
import { AssistantPanel } from "@/modules/assistant/ui";
import { useScoreEditor } from "@/modules/editor/ui";
import { usePlayback } from "@/modules/playback/ui";
import { downloadScoreFile, localProjectRepository, readScoreFile } from "@/modules/projects";
import { useWorkspaceShortcuts } from "../hooks/use-workspace-shortcuts";
import { AppHeader } from "./AppHeader";
import { DocumentBar } from "./DocumentBar";
import { ErrorBanner } from "./ErrorBanner";
import { ScoreCanvas } from "./ScoreCanvas";
import { StatusBar } from "./StatusBar";
import { TransportBar } from "./TransportBar";
import styles from "./workspace.module.css";

/** Route-level screen: composes editor, playback and project persistence. Holds no rules itself. */
export function WorkspaceScreen() {
  const [zoom, setZoom] = useState(100);
  const playback = usePlayback();
  const editor = useScoreEditor(playback.stop, localProjectRepository);
  useWorkspaceShortcuts(playback.stop, editor.undoRedo);

  const openFile = async (file: File) => {
    try {
      editor.openScore(await readScoreFile(file));
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : "That score could not be opened.");
    }
  };

  return (
    <div className={styles.app}>
      <AppHeader title={editor.score.title} />
      <main className={styles.main}>
        <AssistantPanel
          getScore={editor.getScore}
          revision={editor.score.revision}
          selectedIds={[editor.selectedId, editor.selectedBarId, editor.selectedItem?.id].filter(
            (id): id is string => !!id,
          )}
          applyCommands={editor.applyCommands}
          onUndo={() => editor.undoRedo("undo")}
        />
        <section className={styles.studio} aria-label="Score workspace">
          <DocumentBar
            ready={editor.ready}
            onOpenFile={openFile}
            onDownload={() => downloadScoreFile(editor.score)}
            onPrint={() => window.print()}
          />
          <TransportBar
            editor={editor}
            playing={playback.playing}
            onTogglePlay={() => playback.toggle(editor.score, editor.setError)}
            zoom={zoom}
            onZoom={setZoom}
          />
          {editor.error && <ErrorBanner message={editor.error} onDismiss={() => editor.setError(null)} />}
          <ScoreCanvas editor={editor} playBeat={playback.playBeat} zoom={zoom} />
          <StatusBar score={editor.score} selection={editor.selection} playing={playback.playing} />
        </section>
      </main>
    </div>
  );
}
