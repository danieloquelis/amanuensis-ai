import { File, FileText, X } from "@phosphor-icons/react";
import type { PendingFile } from "../hooks/use-attachments";
import styles from "./assistant.module.css";

type AttachmentChipsProps = { files: PendingFile[]; onRemove: (id: string) => void };

/** The short tag under a file's icon: its extension ("PDF", "TXT"), or its kind. */
const extension = (file: File, kind: PendingFile["kind"]) =>
  /\.([a-z0-9]{1,4})$/i.exec(file.name)?.[1]?.toUpperCase() ?? kind.toUpperCase();

/**
 * The files waiting to be sent, as small square tiles in one row: a picture's thumbnail, or a
 * file's icon and extension. The name is in the tooltip; × in the corner takes the file away.
 */
export function AttachmentChips({ files, onRemove }: AttachmentChipsProps) {
  if (!files.length) return null;
  return (
    <ul className={styles.attachments} aria-label="Attached files">
      {files.map(({ id, file, kind, preview }) => (
        <li key={id} className={styles.attachment} title={file.name}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset
            <img src={preview} alt={file.name} />
          ) : (
            <span className={styles.attachmentFile}>
              {kind === "pdf" ? <File size={18} /> : <FileText size={18} />}
              <span>{extension(file, kind)}</span>
              <span className={styles.visuallyHidden}>{file.name}</span>
            </span>
          )}
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(id)}>
            <X size={10} weight="bold" />
          </button>
        </li>
      ))}
    </ul>
  );
}
