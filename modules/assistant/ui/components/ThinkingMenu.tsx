import { useId, useRef, useState } from "react";
import { Brain, Check } from "@phosphor-icons/react";
import { moveMenuFocus } from "@/shared/ui/menu-keyboard";
import surface from "@/shared/ui/surface.module.css";
import { THINKING_LEVELS, type Thinking } from "../../application/thinking";
import styles from "./assistant.module.css";

/** The menu keeps this far (px) from its button and from the window's edges. */
const GAP = 8;
const EDGE_MARGIN = 12;

const LEVELS: Record<Thinking, { name: string; hint: string }> = {
  low: { name: "Low", hint: "Fastest replies" },
  medium: { name: "Medium", hint: "Thinks about the music" },
  high: { name: "High", hint: "Thinks longest, for hard takes and pages" },
};

/**
 * How long the assistant may think before it acts: a small button in the compose bar showing the
 * level, and a menu to change it. A native popover, so a click elsewhere or Escape closes it.
 */
export function ThinkingMenu({ level, onChange }: { level: Thinking; onChange: (level: Thinking) => void }) {
  const id = useId();
  const anchor = useRef({ left: 0, top: 0 });
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: EDGE_MARGIN });
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <>
      <button
        type="button"
        className={styles.thinking}
        popoverTarget={id}
        aria-haspopup="menu"
        aria-label={`Thinking: ${LEVELS[level].name}`}
        title={`Thinking: ${LEVELS[level].name}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { left: rect.left, top: rect.top };
        }}
      >
        <Brain size={18} aria-hidden="true" />
        <span className={styles.thinkingLabel}>{LEVELS[level].name}</span>
      </button>
      <div
        id={id}
        popover="auto"
        role="menu"
        aria-label="Thinking"
        className={`${surface.panel} ${surface.popover} ${styles.thinkingMenu}`}
        style={position}
        onKeyDown={moveMenuFocus}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          // Above the button (the bar sits low), kept inside the window, now that the menu can be measured.
          const { offsetWidth: width, offsetHeight: height } = e.currentTarget;
          const { left, top } = anchor.current;
          setPosition({
            left: Math.max(EDGE_MARGIN, Math.min(left, innerWidth - width - EDGE_MARGIN)),
            top: Math.max(EDGE_MARGIN, top - height - GAP),
          });
          e.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
        }}
      >
        {THINKING_LEVELS.map((option) => (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={option === level}
            className={styles.thinkingItem}
            onClick={() => {
              onChange(option);
              close();
            }}
          >
            <span>
              <span className={styles.thinkingName}>{LEVELS[option].name}</span>
              <span className={styles.thinkingHint}>{LEVELS[option].hint}</span>
            </span>
            {option === level && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </>
  );
}
