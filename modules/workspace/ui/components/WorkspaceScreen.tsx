"use client";

import { useCallback, useRef, useState } from "react";
import { partOf, type Pitch } from "@/modules/score";
import { localChatRepository } from "@/modules/assistant";
import { ComposeDock, useAssistant, useComposeDock } from "@/modules/assistant/ui";
import { playbackStart, selectionAnchors } from "@/modules/editor";
import { ScoreToolMenus, useClipboardShortcuts, useScoreEditor } from "@/modules/editor/ui";
import { usePlayback } from "@/modules/playback/ui";
import { localProjectRepository } from "@/modules/projects";
import { useAnchorRect } from "@/shared/ui/hooks/use-anchor-rect";
import { useBottomInset } from "@/shared/ui/hooks/use-bottom-inset";
import { useNoteAudition } from "../hooks/use-note-audition";
import { ZOOM_RANGE } from "../hooks/use-pinch-zoom";
import { useWorkspaceShortcuts } from "../hooks/use-workspace-shortcuts";
import { BrandMark } from "./BrandMark";
import { DocumentControls } from "./DocumentControls";
import { NewSongButton } from "./NewSongButton";
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
  const [zoom, setZoom] = useState<number>(ZOOM_RANGE.initial);
  // A right-click menu on the sheet replaces the selection card while it is open.
  const [menuOpen, setMenuOpen] = useState(false);
  const playback = usePlayback();
  const editor = useScoreEditor(playback.stop, localProjectRepository);
  const assistant = useAssistant({
    getScore: editor.getScore,
    applyCommands: editor.applyCommands,
    chats: localChatRepository,
  });
  const studio = useRef<HTMLElement>(null);
  const { anchor, area } = useAnchorRect(
    studio,
    "data-sheet-ref",
    selectionAnchors(editor.score, editor.picked),
    `${editor.score.revision}:${zoom}`,
  );
  // The compose bar and its floating chat own the bottom of the workspace; the selection card avoids them.
  const bottomDock = useRef<HTMLDivElement>(null);
  const reserved = useBottomInset(studio, bottomDock);
  const dock = useComposeDock();
  // Opening the floating chat folds the card away (the selection stays, for the chat); a press on the score brings it back.
  const chatOpen = dock.chatMode === "floating";
  const selectionOpen = editor.ready && !menuOpen && !chatOpen && editor.picked.length > 0 && anchor !== null;
  useWorkspaceShortcuts(playback.stop, editor.undoRedo);
  useClipboardShortcuts(editor);
  const { audition: soundPitch } = playback;
  const { getScore } = editor;
  // A note sounds on its own part's instrument.
  const soundNote = useCallback(
    (pitch: Pitch, eventId: string) => soundPitch(pitch, partOf(getScore(), eventId).instrument),
    [soundPitch, getScore],
  );
  const audition = useNoteAudition(editor.selection?.event ?? null, soundNote);
  const undo = () => editor.undoRedo("undo");
  // With something selected, Play starts from the first bar of the selection.
  const playFrom = playbackStart(editor.score, editor.picked);
  const startNewSong = () => {
    editor.startOver();
    assistant.clear();
  };
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
        <ScoreCanvas
          editor={editor}
          playBeat={playback.playBeat}
          zoom={zoom}
          onZoom={setZoom}
          onMenuOpenChange={setMenuOpen}
          onAudition={audition}
          onPress={dock.dismissChat}
        />
        {selectionOpen && <SelectionCard editor={editor} anchor={anchor} area={area} reserved={reserved} />}
        {chatDocked && composeDock}
        <div className={styles.overlay}>
          <div className={styles.topStart}>
            <BrandMark />
            <NewSongButton disabled={!editor.ready} onConfirm={startNewSong} />
          </div>
          <div className={styles.topCenter}>
            <ScoreToolMenus
              score={editor.score}
              selection={editor.selection}
              selectedBarId={editor.selectedBarId}
              selectedStaffId={editor.selectedStaffId}
              ready={editor.ready}
              onCommand={editor.commit}
              onError={editor.setError}
              compact={chatDocked}
              leading={
                <PlaybackControls
                  editor={editor}
                  playing={playback.playing}
                  loading={playback.loading}
                  startBar={playFrom?.bar ?? null}
                  onTogglePlay={() => playback.toggle(editor.score, editor.setError, playFrom?.measureId)}
                />
              }
            />
            {editor.error && <ErrorBanner message={editor.error} onDismiss={() => editor.setError(null)} />}
          </div>
          <div className={styles.topEnd}>
            <DocumentControls editor={editor} />
          </div>
          <div ref={bottomDock} className={styles.bottomCenter}>
            {!chatDocked && composeDock}
          </div>
        </div>
      </section>
    </main>
  );
}
