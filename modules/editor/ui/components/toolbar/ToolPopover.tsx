import { useId, useState, type ReactNode } from "react";
import { classNames } from "@/shared/ui/class-names";
import styles from "./toolbar.module.css";

const ESTIMATED_WIDTH = 300;
const EDGE_MARGIN = 12;

type ToolPopoverProps = {
  label: ReactNode;
  accessibleLabel: string;
  disabled?: boolean;
  /** Renders the trigger label as a music symbol (ƒ, 𝄋). */
  symbol?: boolean;
  /** Content, optionally a function receiving `close` for one-shot tools. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/** Toolbar button with a native popover placed under it and kept inside the viewport. */
export function ToolPopover({ label, accessibleLabel, disabled, symbol = false, children }: ToolPopoverProps) {
  const id = useId();
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: 160 });
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <>
      <button
        className={classNames(styles.trigger, symbol && styles.symbol)}
        popoverTarget={id}
        disabled={disabled}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        aria-haspopup="dialog"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const left = Math.max(EDGE_MARGIN, Math.min(rect.left, window.innerWidth - ESTIMATED_WIDTH));
          setPosition({ left, top: rect.bottom + 8 });
        }}
      >
        {label}
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={accessibleLabel}
        className={styles.popover}
        style={position}
      >
        {typeof children === "function" ? children(close) : children}
      </div>
    </>
  );
}
