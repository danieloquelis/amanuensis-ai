import { FilePdf, FileText, X } from "@phosphor-icons/react";
import type { PendingFile } from "../hooks/use-attachments";
import styles from "./assistant.module.css";

type AttachmentChipsProps = { files: PendingFile[]; onRemove: (id: string) => void };

/** The files waiting to be sent: a thumbnail (or a file icon) and the name, each with ×. */
export function AttachmentChips({ files, onRemove }: AttachmentChipsProps) {
  if (!files.length) return null;
  return (
    <ul className={styles.attachments} aria-label="Attached files">
      {files.map(({ id, file, kind, preview }) => (
        <li key={id} className={styles.attachment}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset */}
          {preview ? <img src={preview} alt="" /> : kind === "pdf" ? <FilePdf size={18} /> : <FileText size={18} />}
          <span>{file.name}</span>
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(id)}>
            <X size={11} weight="bold" />
          </button>
        </li>
      ))}
    </ul>
  );
}
