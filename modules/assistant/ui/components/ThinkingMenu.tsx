import { useId, useRef, useState } from "react";
import { Brain, Check } from "@phosphor-icons/react";
import { moveMenuFocus } from "@/shared/ui/menu-keyboard";
import { placeMenu } from "@/shared/ui/floating-placement";
import surface from "@/shared/ui/surface.module.css";
import { THINKING_LEVELS, type Thinking } from "../../application/thinking";
import styles from "./assistant.module.css";

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
  const anchor = useRef({ left: 0, top: 0, bottom: 0 });
  const [position, setPosition] = useState<ReturnType<typeof placeMenu> | null>(null);
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <>
      <button
        type="button"
        className={styles.thinkingButton}
        popoverTarget={id}
        aria-haspopup="menu"
        aria-label={`Thinking: ${LEVELS[level].name}`}
        title={`Thinking: ${LEVELS[level].name}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { left: rect.left, top: rect.top, bottom: rect.bottom };
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
        style={position ?? undefined}
        onKeyDown={moveMenuFocus}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          setPosition(
            placeMenu(anchor.current, e.currentTarget.offsetWidth, { width: innerWidth, height: innerHeight }),
          );
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
