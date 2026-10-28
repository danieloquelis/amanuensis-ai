"use client";

import { useRef, useState } from "react";
import { AssistantPanel, CanvasAssistant, useAssistant, type RequestContext } from "@/modules/assistant/ui";
import { useScoreEditor } from "@/modules/editor/ui";
import { usePlayback } from "@/modules/playback/ui";
import { localProjectRepository } from "@/modules/projects";
import { useAnchorRect } from "@/shared/ui/hooks/use-anchor-rect";
import { useWorkspaceShortcuts } from "../hooks/use-workspace-shortcuts";
import { AppHeader } from "./AppHeader";
import { ErrorBanner } from "./ErrorBanner";
import { ScoreCanvas } from "./ScoreCanvas";
import { StatusBar } from "./StatusBar";
import { TransportBar } from "./TransportBar";
import styles from "./workspace.module.css";

/**
 * Route-level screen: composes editor, playback, project persistence and the assistant (on the
 * sheet, and in the chat panel that opens beside it). Holds no rules itself.
 */
export function WorkspaceScreen() {
  const [zoom, setZoom] = useState(100);
  const [chatOpen, setChatOpen] = useState(false);
  const playback = usePlayback();
  const editor = useScoreEditor(playback.stop, localProjectRepository);
  const assistant = useAssistant({ getScore: editor.getScore, applyCommands: editor.applyCommands });
  const canvasArea = useRef<HTMLDivElement>(null);
  const { anchor, area } = useAnchorRect(
    canvasArea,
    "data-sheet-ref",
    editor.picked.map((ref) => `${ref.kind}:${ref.id}`),
    `${editor.score.revision}:${zoom}`,
  );
  useWorkspaceShortcuts(playback.stop, editor.undoRedo);
  const about = (origin: RequestContext["origin"]): RequestContext => ({
    ids: editor.picked.map((ref) => ref.id),
    name: editor.pickedName,
    origin,
  });
  const undo = () => editor.undoRedo("undo");

  return (
    <div className={styles.app}>
      <AppHeader title={editor.score.title} chatOpen={chatOpen} onToggleChat={() => setChatOpen((open) => !open)} />
      <main className={chatOpen ? styles.main : `${styles.main} ${styles.chatClosed}`}>
        {chatOpen && (
          <AssistantPanel
            assistant={assistant}
            context={about("chat")}
            revision={editor.score.revision}
            onUndo={undo}
            onClose={() => setChatOpen(false)}
          />
        )}
        <section className={styles.studio} aria-label="Score workspace">
          <TransportBar
            editor={editor}
            playing={playback.playing}
            onTogglePlay={() => playback.toggle(editor.score, editor.setError)}
            zoom={zoom}
            onZoom={setZoom}
          />
          {editor.error && <ErrorBanner message={editor.error} onDismiss={() => editor.setError(null)} />}
          <div ref={canvasArea} className={styles.canvasArea}>
            <ScoreCanvas editor={editor} playBeat={playback.playBeat} zoom={zoom} />
            {editor.ready && (
              <CanvasAssistant
                assistant={assistant}
                context={about("canvas")}
                anchor={anchor}
                area={area}
                revision={editor.score.revision}
                onUndo={undo}
              />
            )}
          </div>
          <StatusBar
            score={editor.score}
            selection={editor.selection}
            pickedName={editor.picked.length > 1 ? editor.pickedName : null}
            playing={playback.playing}
            saveStatus={editor.saveStatus}
          />
        </section>
      </main>
    </div>
  );
}
