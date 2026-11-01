import { useId, useRef, useState, type ReactNode } from "react";
import surface from "@/shared/ui/surface.module.css";
import styles from "./toolbar.module.css";

const EDGE_MARGIN = 12;
const GAP = 10;

type ToolPopoverProps = {
  /** The trigger's face: an icon, or the current value ("4/4", "D"). */
  icon: ReactNode;
  /** The short name under it ("Time", "Key"). */
  label: string;
  accessibleLabel: string;
  disabled?: boolean;
  /** Content, optionally a function receiving `close` for one-shot tools. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/** Toolbar tool with a native popover centred under it and kept inside the viewport. */
export function ToolPopover({ icon, label, accessibleLabel, disabled, children }: ToolPopoverProps) {
  const id = useId();
  const anchor = useRef({ center: 0, top: 0 });
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: 80 });
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <>
      <button
        className={styles.tool}
        popoverTarget={id}
        disabled={disabled}
        aria-label={accessibleLabel}
        aria-haspopup="dialog"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { center: rect.left + rect.width / 2, top: rect.bottom + GAP };
        }}
      >
        <span className={styles.toolIcon}>{icon}</span>
        <span className={styles.toolLabel}>{label}</span>
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={accessibleLabel}
        className={`${surface.panel} ${surface.popover} ${styles.popover}`}
        style={position}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          // Centre under the trigger now that the open popover has a measurable width.
          const width = e.currentTarget.offsetWidth;
          const { center, top } = anchor.current;
          const left = Math.max(EDGE_MARGIN, Math.min(center - width / 2, window.innerWidth - width - EDGE_MARGIN));
          setPosition({ left, top });
        }}
      >
        {typeof children === "function" ? children(close) : children}
      </div>
    </>
  );
}
