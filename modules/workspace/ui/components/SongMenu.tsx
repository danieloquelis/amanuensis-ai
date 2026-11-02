import { ArrowSquareOut, Copy, DotsThree, Trash } from "@phosphor-icons/react";
import type { SongFile } from "../export-song";
import { ActionMenu } from "./ActionMenu";
import { ExportItems } from "./ExportItems";
import styles from "./song-menu.module.css";

type SongMenuProps = {
  title: string;
  /** "Edited 20 hours ago", under the title. */
  edited: string;
  href: string;
  /** Copying and saving need a score that can be read; without one, only Delete is offered. */
  readable: boolean;
  onCopy: () => void;
  onPrint: () => void;
  onDownload: (file: SongFile) => void;
  onDelete: () => void;
};

/**
 * A song's "⋯" button and its menu: the song's name and age, then what can be done with it:
 * open it in a new tab, make a copy, save it as a PDF, MusicXML or MIDI, or delete it.
 */
export function SongMenu({ title, edited, href, readable, onCopy, onPrint, onDownload, onDelete }: SongMenuProps) {
  return (
    <ActionMenu
      label={`More actions for ${title}`}
      menuLabel={title}
      icon={<DotsThree size={20} weight="bold" aria-hidden="true" />}
      triggerClassName={styles.trigger}
    >
      {(close) => (
        <>
          <div className={styles.header}>
            <p className={styles.title}>{title}</p>
            <p className={styles.edited}>{edited}</p>
          </div>
          <a role="menuitem" className={styles.item} href={href} target="_blank" rel="noopener" onClick={close}>
            <ArrowSquareOut size={18} aria-hidden="true" />
            Open in new tab
          </a>
          {readable && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  close();
                  onCopy();
                }}
              >
                <Copy size={18} aria-hidden="true" />
                Make a copy
              </button>
              <div className={styles.divider} role="separator" />
              <ExportItems onPrint={onPrint} onDownload={onDownload} close={close} />
            </>
          )}
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
        </>
      )}
    </ActionMenu>
  );
}
