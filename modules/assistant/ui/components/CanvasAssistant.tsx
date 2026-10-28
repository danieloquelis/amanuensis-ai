import { placeAround, placePin } from "@/shared/ui/floating-placement";
import type { AnchorArea, AnchorRect } from "@/shared/ui/hooks/use-anchor-rect";
import type { Assistant, RequestContext } from "../hooks/use-assistant";
import { useCanvasComposer } from "../hooks/use-canvas-composer";
import { CloseIcon, SparkIcon } from "./icons";
import { Composer } from "./Composer";
import { TurnBubbles } from "./TurnBubbles";
import styles from "./assistant.module.css";

const BUTTON = { width: 40, height: 40 };
const POPOVER = { width: 360, height: 300 };

type CanvasAssistantProps = {
  assistant: Assistant;
  /** What a request from here is about: the selection, or the whole score when nothing is picked. */
  context: RequestContext;
  /** Where the selection is in the canvas area, or null to dock in the corner. */
  anchor: AnchorRect | null;
  area: AnchorArea;
  revision: number;
  onUndo: () => void;
};

/**
 * The assistant on the sheet: an icon pinned to the selection (or docked in the corner) that
 * opens a small composer for changes to just that selection. The exchange also lands in the chat.
 */
export function CanvasAssistant({ assistant, context, anchor, area, revision, onUndo }: CanvasAssistantProps) {
  const composer = useCanvasComposer(assistant);
  const docked = !anchor || !area.width;
  const button = docked ? null : placePin(anchor, area, BUTTON);
  const subject = context.name ?? "Whole score";
  const label = context.name ? `Ask the assistant about ${context.name}` : "Ask the assistant";

  if (!composer.open) {
    return (
      <button
        key={docked ? "docked" : "pinned"}
        className={docked ? `${styles.canvasButton} ${styles.docked}` : styles.canvasButton}
        style={button ?? undefined}
        aria-label={label}
        title={`${label} (⌘K)`}
        onClick={composer.show}
      >
        <SparkIcon />
      </button>
    );
  }

  const place = docked ? null : placeAround(anchor, area, POPOVER);
  const { turn } = composer;
  return (
    <div
      className={place ? styles.canvasComposer : `${styles.canvasComposer} ${styles.docked}`}
      style={place ?? undefined}
      role="dialog"
      aria-label="Ask the assistant"
    >
      <div className={styles.canvasHeader}>
        <span className={styles.contextChip}>{subject}</span>
        <button className={styles.closePanel} aria-label="Close" onClick={composer.hide}>
          <CloseIcon />
        </button>
      </div>
      {turn && (
        <ol className={styles.canvasTurn} aria-live="polite">
          <TurnBubbles
            turn={turn}
            canUndo={turn.revision !== undefined && turn.revision === revision}
            busy={assistant.busy}
            onUndo={onUndo}
            onChoose={(choice) => void assistant.send(choice, context)}
          />
        </ol>
      )}
      <Composer
        busy={assistant.busy}
        label="Ask about the selection"
        placeholder={context.name ? `What should change in ${context.name}?` : "What should change?"}
        autoFocus
        onSend={(text) => void assistant.send(text, context)}
        onTake={(wav) => void assistant.sendTake(wav, context)}
      />
    </div>
  );
}
