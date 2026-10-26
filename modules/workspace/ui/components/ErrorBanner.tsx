import { Icon } from "@/shared/ui/Icon";
import styles from "./workspace.module.css";

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={onDismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
