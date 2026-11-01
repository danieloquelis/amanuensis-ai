import { useId, useRef, useState } from "react";
import { ArrowSquareOut, DotsThree, Trash } from "@phosphor-icons/react";
import { IconButton } from "@/shared/ui/IconButton";
import { moveMenuFocus } from "@/shared/ui/menu-keyboard";
import surface from "@/shared/ui/surface.module.css";
import styles from "./song-menu.module.css";

/** The menu keeps this far (px) from its button and from the window's edges. */
const GAP = 8;
const EDGE_MARGIN = 12;

type SongMenuProps = {
  title: string;
  /** "Edited 20 hours ago", under the title. */
  edited: string;
  href: string;
  onDelete: () => void;
};

/**
 * A song's "⋯" button and its menu: the song's name and age, then what can be done with it.
 * A native popover, so a click elsewhere or Escape closes it.
 */
export function SongMenu({ title, edited, href, onDelete }: SongMenuProps) {
  const id = useId();
  const anchor = useRef({ right: 0, bottom: 0 });
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: EDGE_MARGIN });
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <>
      <IconButton
        className={styles.trigger}
        label={`More actions for ${title}`}
        popoverTarget={id}
        aria-haspopup="menu"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { right: rect.right, bottom: rect.bottom };
        }}
      >
        <DotsThree size={20} weight="bold" aria-hidden="true" />
      </IconButton>
      <div
        id={id}
        popover="auto"
        role="menu"
        aria-label={title}
        className={`${surface.panel} ${surface.popover} ${styles.menu}`}
        style={position}
        onKeyDown={moveMenuFocus}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          // Right-aligned under the button, kept inside the window, now that the menu can be measured.
          const { offsetWidth: width, offsetHeight: height } = e.currentTarget;
          const { right, bottom } = anchor.current;
          const left = Math.max(EDGE_MARGIN, Math.min(right - width, innerWidth - width - EDGE_MARGIN));
          const top = Math.max(EDGE_MARGIN, Math.min(bottom + GAP, innerHeight - height - EDGE_MARGIN));
          setPosition({ left, top });
          e.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }}
      >
        <div className={styles.header}>
          <p className={styles.title}>{title}</p>
          <p className={styles.edited}>{edited}</p>
        </div>
        <a role="menuitem" className={styles.item} href={href} target="_blank" rel="noopener" onClick={close}>
          <ArrowSquareOut size={18} aria-hidden="true" />
          Open in new tab
        </a>
        <div className={styles.divider} role="separator" />
        <button
          type="button"
          role="menuitem"
          className={`${styles.item} ${styles.danger}`}
          onClick={() => {
            close();
            onDelete();
          }}
        >
          <Trash size={18} aria-hidden="true" />
          Delete
        </button>
      </div>
    </>
  );
}
