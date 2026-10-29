"use client";

import { useRef, useState } from "react";
import { ComposeDock, useAssistant, useComposeDock } from "@/modules/assistant/ui";
import { ScoreToolMenus, useScoreEditor } from "@/modules/editor/ui";
import { usePlayback } from "@/modules/playback/ui";
import { localProjectRepository } from "@/modules/projects";
import { useAnchorRect } from "@/shared/ui/hooks/use-anchor-rect";
import { useWorkspaceShortcuts } from "../hooks/use-workspace-shortcuts";
import { BrandMark } from "./BrandMark";
import { DocumentControls } from "./DocumentControls";
import { ErrorBanner } from "./ErrorBanner";
import { PlaybackControls } from "./PlaybackControls";
import { ScoreCanvas } from "./ScoreCanvas";
import { SelectionCard } from "./SelectionCard";
import styles from "./workspace.module.css";

/**
 * Route-level screen: the score fills the window and the controls float over it. Playback and
 * notation tools at the top; a selected note or bar gets its edit tools beside it; at the bottom
 * centre, the compose bar and its chat, which always know what is selected. With the chat
 * expanded, it takes the left column and the toolbar row and score share the rest, centred on
 * each other. Holds no rules itself.
 */
export function WorkspaceScreen() {
  const [zoom, setZoom] = useState(100);
  // A right-click menu on the sheet replaces the selection card while it is open.
  const [menuOpen, setMenuOpen] = useState(false);
  const playback = usePlayback();
  const editor = useScoreEditor(playback.stop, localProjectRepository);
  const assistant = useAssistant({ getScore: editor.getScore, applyCommands: editor.applyCommands });
  const studio = useRef<HTMLElement>(null);
  const { anchor, area } = useAnchorRect(
    studio,
    "data-sheet-ref",
    editor.picked.map((ref) => `${ref.kind}:${ref.id}`),
    `${editor.score.revision}:${zoom}`,
  );
  const selectionOpen = editor.ready && !menuOpen && editor.picked.length > 0 && anchor !== null;
  const dock = useComposeDock();
  useWorkspaceShortcuts(playback.stop, editor.undoRedo);
  const undo = () => editor.undoRedo("undo");
  // Expanded, the chat takes the left column of the screen and everything else shares the rest.
  const chatDocked = dock.chatMode === "sidebar";
  const composeDock = editor.ready && (
    <ComposeDock
      assistant={assistant}
      dock={dock}
      context={{ ids: editor.picked.map((ref) => ref.id), name: editor.pickedName }}
      revision={editor.score.revision}
      onUndo={undo}
    />
  );

  return (
    <main className={styles.app}>
      <section ref={studio} className={styles.studio} data-chat={dock.chatMode} aria-label="Score workspace">
        <ScoreCanvas editor={editor} playBeat={playback.playBeat} zoom={zoom} onMenuOpenChange={setMenuOpen} />
        {selectionOpen && <SelectionCard editor={editor} anchor={anchor} area={area} />}
        {chatDocked && composeDock}
        <div className={styles.overlay}>
          <div className={styles.topStart}>
            <BrandMark />
          </div>
          <div className={styles.topCenter}>
            <ScoreToolMenus
              score={editor.score}
              selection={editor.selection}
              selectedBarId={editor.selectedBarId}
              ready={editor.ready}
              onCommand={editor.commit}
              onError={editor.setError}
              compact={chatDocked}
              leading={
                <PlaybackControls
                  editor={editor}
                  playing={playback.playing}
                  onTogglePlay={() => playback.toggle(editor.score, editor.setError)}
                />
              }
            />
            {editor.error && <ErrorBanner message={editor.error} onDismiss={() => editor.setError(null)} />}
          </div>
          <div className={styles.topEnd}>
            <DocumentControls editor={editor} zoom={zoom} onZoom={setZoom} />
          </div>
          <div className={styles.bottomCenter}>{!chatDocked && composeDock}</div>
        </div>
      </section>
    </main>
  );
}
