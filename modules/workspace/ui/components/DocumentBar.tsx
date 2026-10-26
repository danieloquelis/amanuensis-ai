import { useRef } from "react";
import { Icon } from "@/shared/ui/Icon";
import styles from "./workspace.module.css";

type DocumentBarProps = {
  ready: boolean;
  onOpenFile: (file: File) => void;
  onDownload: () => void;
  onPrint: () => void;
};

/** Document label plus Open, Save a copy and Print. */
export function DocumentBar({ ready, onOpenFile, onDownload, onPrint }: DocumentBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.toolbar}>
      <div className={styles.documentLabel}>
        <span className={styles.smallIcon}>
          <Icon name="note" size={16} />
        </span>
        <span>Score editor</span>
        <span className={styles.badge}>MELODY</span>
      </div>
      <div className={styles.fileActions}>
        <button disabled={!ready} onClick={() => fileInput.current?.click()} title="Open an Amanuensis JSON score">
          <Icon name="upload" size={15} />
          <span>Open</span>
        </button>
        <button disabled={!ready} onClick={onDownload}>
          <Icon name="download" size={15} />
          <span>Save a copy</span>
        </button>
        <button disabled={!ready} onClick={onPrint} title="Print score or save as PDF" aria-label="Print score">
          <Icon name="print" size={16} />
        </button>
        <input
          className={styles.fileInput}
          type="file"
          accept=".json,application/json"
          ref={fileInput}
          aria-label="Open score file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file again still fires `change`.
            event.target.value = "";
            if (file) onOpenFile(file);
          }}
        />
      </div>
    </div>
  );
}
