import { WarningCircle, X } from "@phosphor-icons/react";
import styles from "./workspace.module.css";

/** A toast under the tools: what could not be done, until dismissed or replaced. */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div key={message} className={styles.error} role="alert">
      <WarningCircle size={18} weight="fill" />
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={onDismiss}>
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
