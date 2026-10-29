import { CaretDown, ChatsCircle, SidebarSimple, Sparkle, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton } from "@/shared/ui/IconButton";
import type { Assistant, RequestContext } from "../hooks/use-assistant";
import type { ComposeDockState } from "../hooks/use-compose-dock";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
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
  const { turns, busy, send, sendTake } = assistant;
  const undoable = [...turns].reverse().find((turn) => turn.revision !== undefined);
  const canUndo = (turnId: string) => turnId === undoable?.id && undoable.revision === revision;
  const sidebar = dock.chatMode === "sidebar";
  const sendText = (text: string) => {
    dock.openChat();
    void send(text, context);
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
  const thread = (actions: ReactNode) => (
    <ChatThread
      turns={turns}
      busy={busy}
      canUndo={canUndo}
      onUndo={onUndo}
      onChoose={sendText}
      actions={actions}
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
      onTake={(wav) => {
        dock.openChat();
        void sendTake(wav, context);
      }}
      accessory={
        !sidebar &&
        turns.length > 0 && (
          <IconButton
            label={dock.chatMode === "floating" ? "Hide chat" : "Show chat"}
            aria-pressed={dock.chatMode === "floating"}
            className={styles.chatButton}
            onClick={dock.toggleChat}
          >
            <ChatsCircle size={21} />
          </IconButton>
        )
      }
    />
  );

  if (sidebar) {
    return (
      <aside className={styles.sidebar} aria-label="Chat">
        {thread(
          <button className={styles.dismiss} aria-label="Close chat" onClick={dock.closeChat}>
            <X size={15} weight="bold" />
          </button>,
        )}
        <div className={styles.sidebarComposer}>{composer}</div>
      </aside>
    );
  }

  return (
    <div className={styles.dock}>
      <div className={styles.above}>
        {dock.chatMode === "floating" && turns.length > 0 ? (
          <section className={styles.chat} aria-label="Chat">
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
