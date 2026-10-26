import { useId, useState, type ReactNode } from "react";
import { classNames } from "@/shared/ui/class-names";
import styles from "./toolbar.module.css";

const POPOVER_WIDTH = 332;
const EDGE_MARGIN = 12;

type ToolPopoverProps = {
  label: string;
  accessibleLabel: string;
  disabled?: boolean;
  /** Renders the trigger label as a music symbol (ƒ, :‖). */
  symbol?: boolean;
  children: ReactNode;
};

/** Toolbar button with a native popover placed under it and kept inside the viewport. */
export function ToolPopover({ label, accessibleLabel, disabled, symbol = false, children }: ToolPopoverProps) {
  const id = useId();
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: 160 });
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
          const left = Math.max(EDGE_MARGIN, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH));
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
        {children}
      </div>
    </>
  );
}
