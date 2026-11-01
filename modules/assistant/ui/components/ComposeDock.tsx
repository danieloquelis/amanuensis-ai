import { INSTRUMENTS } from "@/modules/score";
import { CaretDown, ChatsCircle, SidebarSimple, Sparkle, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton } from "@/shared/ui/IconButton";
import { DOCKED_PANEL } from "@/shared/ui/hooks/use-bottom-inset";
import surface from "@/shared/ui/surface.module.css";
import type { Assistant, RequestContext } from "../hooks/use-assistant";
import { useAttachments } from "../hooks/use-attachments";
import type { ComposeDockState } from "../hooks/use-compose-dock";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { BandMenu } from "./BandMenu";
import { ChatResizeHandle } from "./ChatResizeHandle";
import { MemoryMenu } from "./MemoryMenu";
import { ThinkingMenu } from "./ThinkingMenu";
import styles from "./assistant.module.css";

const SUGGESTIONS = ["Chords C, F, G7, C — one per bar", "Add D.C. al Fine at the end", "Make it waltz time"];

type ComposeDockProps = {
  assistant: Assistant;
  dock: ComposeDockState;
  /** What a request is about: the current selection (picked on the sheet), or the whole score. */
  context: RequestContext;
  revision: number;
  onUndo: () => void;
};

/**
 * The AI: the compose bar, which always knows what is selected on the sheet, and the chat. At
 * rest the bar sits at the bottom centre with the chat floating above it; expanded, the chat
 * becomes a sidebar on the left with the bar at its foot, until it is closed again.
 */
export function ComposeDock({ assistant, dock, context, revision, onUndo }: ComposeDockProps) {
  const { turns, busy, send, sendTake, canRetry, retry, stop } = assistant;
  // Held here, not in the bar, so attached files stay when the bar moves to the sidebar.
  const attachments = useAttachments();
  const undoable = [...turns].reverse().find((turn) => turn.revision !== undefined);
  const canUndo = (turnId: string) => turnId === undoable?.id && undoable.revision === revision;
  const sidebar = dock.chatMode === "sidebar";
  // The chat is hidden while the AI works: a dot on its button says so.
  const working = busy && dock.chatMode === "closed";
  const sendText = (text: string, files: File[] = []) => {
    dock.openChat();
    void send(text, context, files);
  };
  const suggestions = (
    <div className={styles.suggestions} role="group" aria-label="Suggestions">
      {SUGGESTIONS.map((suggestion) => (
        <button key={suggestion} onClick={() => sendText(suggestion)}>
          <Sparkle size={13} weight="fill" />
          {suggestion}
        </button>
      ))}
    </div>
  );
  const remembered = (
    <MemoryMenu
      songNotes={assistant.memory.songNotes}
      facts={assistant.memory.facts}
      onForget={assistant.memory.forget}
      onClearNotes={assistant.memory.clearNotes}
    />
  );
  const thread = (actions: ReactNode) => (
    <ChatThread
      turns={turns}
      busy={busy}
      canUndo={canUndo}
      canRetry={canRetry}
      onUndo={onUndo}
      onRetry={retry}
      onChoose={sendText}
      onRedo={(seat) => {
        // The musician's words go with it: the request is ready to finish and send.
        dock.setDraft(`${seat.name}, play your ${INSTRUMENTS[seat.instrument].name.toLowerCase()} part again: `);
        dock.focus();
      }}
      actions={
        <>
          {remembered}
          {actions}
        </>
      }
      empty={sidebar && <li className={styles.sidebarEmpty}>{suggestions}</li>}
    />
  );
  const composer = (
    <Composer
      busy={busy}
      subject={context.name ?? "Whole score"}
      inputRef={dock.inputRef}
      draft={dock.draft}
      onDraft={dock.setDraft}
      onSend={sendText}
      onStop={stop}
      attachments={attachments}
      onTake={(wav) => {
        dock.openChat();
        void sendTake(wav, context);
      }}
      accessory={
        <>
          <BandMenu
            on={assistant.band.on}
            members={assistant.band.members}
            onTurn={assistant.band.turn}
            onMembers={assistant.band.setMembers}
          />
          <ThinkingMenu level={assistant.thinking.level} onChange={assistant.thinking.choose} />
          {!sidebar && turns.length > 0 && (
            <IconButton
              label={`${dock.chatMode === "floating" ? "Hide chat" : "Show chat"}${working ? ", the assistant is working" : ""}`}
              aria-pressed={dock.chatMode === "floating"}
              className={styles.chatButton}
              onClick={dock.toggleChat}
            >
              <ChatsCircle size={21} />
              {working && <span className={styles.activityDot} aria-hidden="true" />}
            </IconButton>
          )}
        </>
      }
    />
  );

  if (sidebar) {
    return (
      <aside className={`${surface.panel} ${styles.sidebar}`} aria-label="Chat">
        {thread(
          <button className={styles.dismiss} aria-label="Close chat" onClick={dock.closeChat}>
            <X size={15} weight="bold" />
          </button>,
        )}
        <div className={styles.sidebarComposer}>{composer}</div>
        <ChatResizeHandle width={dock.chatWidth} onResize={dock.setChatWidth} onDone={dock.keepChatWidth} />
      </aside>
    );
  }

  return (
    <div className={styles.dock}>
      <div className={styles.above}>
        {dock.chatMode === "floating" && turns.length > 0 ? (
          <section className={`${surface.panel} ${styles.chat}`} aria-label="Chat" {...{ [DOCKED_PANEL]: true }}>
            {thread(
              <>
                <button className={styles.dismiss} aria-label="Expand chat" onClick={dock.expandChat}>
                  <SidebarSimple size={16} />
                </button>
                <button className={styles.dismiss} aria-label="Hide chat" onClick={dock.toggleChat}>
                  <CaretDown size={15} weight="bold" />
                </button>
              </>,
            )}
          </section>
        ) : (
          !turns.length && suggestions
        )}
      </div>
      {composer}
    </div>
  );
}
