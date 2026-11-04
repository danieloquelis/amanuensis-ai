import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { partOf } from "@/modules/score";
import { localWorkspaceChats } from "@/modules/assistant";
import { ComposeDock, useAssistant, useComposeDock, type Assistant } from "@/modules/assistant/ui";
import { playbackStart, selectionAnchors } from "@/modules/editor";
import { ScoreToolMenus, useClipboardShortcuts, useScoreEditor } from "@/modules/editor/ui";
import { scoreSounds } from "@/modules/playback";
import { usePlayback } from "@/modules/playback/ui";
import { localWorkspaceRepository, workspaceProject } from "@/modules/projects";
import { useAnchorRect } from "@/shared/ui/hooks/use-anchor-rect";
import { useBottomInset } from "@/shared/ui/hooks/use-bottom-inset";
import surface from "@/shared/ui/surface.module.css";
import { useFirstRequest } from "../hooks/use-first-request";
import { useNoteAudition } from "../hooks/use-note-audition";
import { ZOOM_RANGE } from "../hooks/use-pinch-zoom";
import { usePrintOnOpen } from "../hooks/use-print-on-open";
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
 * One song's editor (opened by `WorkspaceRoute`): the score fills the window and the controls float over it. Playback and
 * notation tools at the top; a selected note or bar gets its edit tools beside it; at the bottom
 * centre, the compose bar and its chat, which always know what is selected. With the chat
 * expanded, it takes the left column and the toolbar row and score share the rest, centred on
 * each other. Holds no rules itself.
 */
export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const [zoom, setZoom] = useState<number>(ZOOM_RANGE.initial);
  // A right-click menu on the sheet replaces the selection card while it is open.
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const playback = usePlayback();
  const repository = useMemo(() => workspaceProject(localWorkspaceRepository, workspaceId), [workspaceId]);
  const chats = useMemo(() => localWorkspaceChats.for(workspaceId), [workspaceId]);
  const editor = useScoreEditor(playback.stop, repository);
  // The score's instruments load as soon as it opens (and when parts change), so the first note sounds right.
  const sounds = scoreSounds(editor.score).join(",");
  const { prepare } = playback;
  const { loaded, getScore } = editor;
  useEffect(() => {
    if (loaded && sounds) prepare(getScore());
  }, [loaded, sounds, prepare, getScore]);
  const assistant = useAssistant({
    getScore: editor.getScore,
    applyCommands: editor.applyCommands,
    chats,
  });
  // Nothing on the sheet or toolbar edits the score while the assistant works on it: its turn commits as one step.
  const { lock } = editor;
  useEffect(() => lock(assistant.busy), [lock, assistant.busy]);
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
  // A song started from Home runs that request as its first turn, once the song and its chat are read.
  useFirstRequest({ workspaceId, ready: loaded && assistant.ready, assistant, openChat: dock.openChat });
  // Opening the floating chat folds the card away (the selection stays, for the chat); a press on the score brings it back.
  const chatOpen = dock.chatMode === "floating";
  const selectionOpen = editor.ready && !menuOpen && !chatOpen && editor.picked.length > 0 && anchor !== null;
  useWorkspaceShortcuts(playback.stop, editor.undoRedo);
  usePrintOnOpen(editor.ready);
  useClipboardShortcuts(editor);
  const { audition: soundPitch } = playback;
  // A note sounds on its own part's instrument.
  const soundNote = useCallback(
    (midi: number, eventId: string) => soundPitch(midi, partOf(getScore(), eventId).instrument),
    [soundPitch, getScore],
  );
  const audition = useNoteAudition(editor.selection?.event ?? null, soundNote);
  const undo = () => editor.undoRedo("undo");
  // With something selected, Play starts from the first bar of the selection.
  const playFrom = playbackStart(editor.score, editor.picked);
  const startNewSong = () => router.push(`/workspace/${localWorkspaceRepository.create()}`);
  // Expanded, the chat takes the left column of the screen and everything else shares the rest.
  const chatDocked = dock.chatMode === "sidebar";
  const composeDock = editor.loaded && (
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
      <section
        ref={studio}
        className={`${styles.studio} ${surface.canvas}`}
        data-chat={dock.chatMode}
        style={{ "--chat-width": `${dock.chatWidth}px` } as CSSProperties}
        aria-label="Score workspace"
      >
        <ScoreCanvas
          workspaceId={workspaceId}
          editor={editor}
          playBeat={playback.playBeat}
          zoom={zoom}
          onZoom={setZoom}
          onMenuOpenChange={setMenuOpen}
          onAudition={audition}
          onPress={dock.dismissChat}
          live={assistant.live}
          draft={assistant.draft}
          glowingPart={playingPart(assistant.turns)}
        />
        {selectionOpen && <SelectionCard editor={editor} anchor={anchor} area={area} reserved={reserved} />}
        {chatDocked && composeDock}
        <div className={styles.overlay}>
          <div className={styles.topStart}>
            <BrandMark />
            <NewSongButton disabled={!editor.ready} onCreate={startNewSong} />
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
                  working={assistant.busy}
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

/** The part a band musician is writing right now, in the turn that is working (Band Mode). */
const playingPart = (turns: Assistant["turns"]) =>
  turns.find((turn) => turn.status === "working")?.band?.find((seat) => seat.state === "playing")?.part ?? null;
