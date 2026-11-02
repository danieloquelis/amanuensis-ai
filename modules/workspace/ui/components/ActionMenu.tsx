import { useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/shared/ui/IconButton";
import { moveMenuFocus } from "@/shared/ui/menu-keyboard";
import surface from "@/shared/ui/surface.module.css";
import styles from "./song-menu.module.css";

/** The menu keeps this far (px) from its button and from the window's edges. */
const GAP = 8;
const EDGE_MARGIN = 12;

type ActionMenuProps = {
  /** The button's accessible name. */
  label: string;
  /** The menu's name, when it is not the button's (a song's menu is named for the song). */
  menuLabel?: string;
  /** What the button shows (an icon). */
  icon: ReactNode;
  /** Extra class for the button (e.g. frosted on a card). */
  triggerClassName?: string;
  /** The menu's items; `close` hides it. */
  children: (close: () => void) => ReactNode;
};

/**
 * A button with a menu of actions under it, opening to its right when there is room, kept inside the window. A native
 * popover, so a click elsewhere or Escape closes it; arrow keys move between its items.
 */
export function ActionMenu({ label, menuLabel = label, icon, triggerClassName, children }: ActionMenuProps) {
  const id = useId();
  const anchor = useRef({ left: 0, right: 0, bottom: 0 });
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: EDGE_MARGIN });
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <>
      <IconButton
        className={triggerClassName}
        label={label}
        popoverTarget={id}
        aria-haspopup="menu"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { left: rect.left, right: rect.right, bottom: rect.bottom };
        }}
      >
        {icon}
      </IconButton>
      <div
        id={id}
        popover="auto"
        role="menu"
        aria-label={menuLabel}
        className={`${surface.panel} ${surface.popover} ${styles.menu}`}
        style={position}
        onKeyDown={moveMenuFocus}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          // Under the button, opening to its right (off what it belongs to); where there is no room
          // on the right (a button at the window's edge), towards the left. Kept inside the window.
          const { offsetWidth: width, offsetHeight: height } = e.currentTarget;
          const { left: start, right, bottom } = anchor.current;
          const fitsRight = start + width <= innerWidth - EDGE_MARGIN;
          const left = Math.max(
            EDGE_MARGIN,
            fitsRight ? start : Math.min(right - width, innerWidth - width - EDGE_MARGIN),
          );
          const top = Math.max(EDGE_MARGIN, Math.min(bottom + GAP, innerHeight - height - EDGE_MARGIN));
          setPosition({ left, top });
          e.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }}
      >
        {children(close)}
      </div>
    </>
  );
}
