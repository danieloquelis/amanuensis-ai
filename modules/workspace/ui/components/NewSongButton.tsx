import { FilePlus } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";
import styles from "./workspace.module.css";

const GAP = 10;

type NewSongButtonProps = {
  disabled: boolean;
  onConfirm: () => void;
};

/**
 * Top left, beside the app mark. Starts a new song once confirmed: the score, its undo history
 * and the chat are cleared for good, so a single stray click must not do it.
 */
export function NewSongButton({ disabled, onConfirm }: NewSongButtonProps) {
  const id = useId();
  const [position, setPosition] = useState({ top: 72, left: 16 });
  const close = () => document.getElementById(id)?.hidePopover();
  return (
    <div className={`${surface.glass} ${surface.pill}`} role="group" aria-label="Song">
      <IconButton
        label="New song"
        tooltip="New song"
        popoverTarget={id}
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosition({ top: rect.bottom + GAP, left: rect.left });
        }}
      >
        <FilePlus size={19} />
      </IconButton>
      <div
        id={id}
        popover="auto"
        role="alertdialog"
        aria-label="Start a new song?"
        className={styles.confirm}
        style={position}
      >
        <p className={styles.confirmTitle}>Start a new song?</p>
        <p className={styles.confirmText}>This clears the score and the chat. It can’t be undone.</p>
        <div className={styles.confirmActions}>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmPrimary}
            onClick={() => {
              close();
              onConfirm();
            }}
          >
            New song
          </button>
        </div>
      </div>
    </div>
  );
}
