import { useId, useRef, useState } from "react";
import { Notebook, X } from "@phosphor-icons/react";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";
import styles from "./assistant.module.css";

/** The panel keeps this far (px) from its button and from the window's edges. */
const GAP = 8;
const EDGE_MARGIN = 12;

type MemoryMenuProps = {
  songNotes: string;
  facts: string[];
  onForget: (fact: string) => void;
  onClearNotes: () => void;
};

/**
 * What the assistant keeps beyond the chat, open to read and to correct: its notes on this song,
 * and what it has learned about the musician. A native popover, under its button.
 */
export function MemoryMenu({ songNotes, facts, onForget, onClearNotes }: MemoryMenuProps) {
  const id = useId();
  const anchor = useRef({ right: 0, bottom: 0 });
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: EDGE_MARGIN });
  return (
    <>
      <IconButton
        label="What the assistant remembers"
        popoverTarget={id}
        className={styles.dismiss}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { right: rect.right, bottom: rect.bottom };
        }}
      >
        <Notebook size={16} />
      </IconButton>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label="What the assistant remembers"
        className={`${surface.panel} ${surface.popover} ${styles.memoryPanel}`}
        style={position}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          const { offsetWidth: width, offsetHeight: height } = e.currentTarget;
          const { right, bottom } = anchor.current;
          setPosition({
            left: Math.max(EDGE_MARGIN, Math.min(right - width, innerWidth - width - EDGE_MARGIN)),
            top: Math.max(EDGE_MARGIN, Math.min(bottom + GAP, innerHeight - height - EDGE_MARGIN)),
          });
        }}
      >
        <section>
          <h3>This song</h3>
          {songNotes ? (
            <>
              <p className={styles.memoryNotes}>{songNotes}</p>
              <button type="button" className={styles.memoryClear} onClick={onClearNotes}>
                Clear notes
              </button>
            </>
          ) : (
            <p className={styles.memoryEmpty}>Nothing noted yet: the assistant writes down what it settles.</p>
          )}
        </section>
        <section>
          <h3>About you</h3>
          {facts.length ? (
            <ul>
              {facts.map((fact) => (
                <li key={fact}>
                  <span>{fact}</span>
                  <IconButton label={`Forget: ${fact}`} className={styles.memoryForget} onClick={() => onForget(fact)}>
                    <X size={12} weight="bold" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.memoryEmpty}>Nothing yet: it learns from what you correct and how you like things.</p>
          )}
        </section>
      </div>
    </>
  );
}
