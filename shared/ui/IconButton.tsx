import type { ButtonHTMLAttributes } from "react";
import { classNames } from "./class-names";
import styles from "./surface.module.css";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name. */
  label: string;
  /** Only for icons whose meaning is not obvious: shown on hover after a short delay. */
  tooltip?: string;
  /** Shown in the tooltip after its text ("⌫"). */
  shortcut?: string;
  /** Where the tooltip opens: below by default, above for controls at the bottom of the screen. */
  tooltipSide?: "top" | "bottom";
};

/** A compact icon button; it names itself to assistive tech, and in a tooltip only when asked. */
export function IconButton({
  label,
  tooltip,
  shortcut,
  tooltipSide = "bottom",
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      data-tooltip={tooltip}
      data-shortcut={tooltip ? shortcut : undefined}
      data-side={tooltipSide}
      className={classNames(styles.iconButton, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
