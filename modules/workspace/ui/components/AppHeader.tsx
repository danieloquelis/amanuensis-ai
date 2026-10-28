import Link from "next/link";
import { ChatIcon } from "@/modules/assistant/ui";
import { Icon } from "@/shared/ui/Icon";
import styles from "./workspace.module.css";

type AppHeaderProps = { title: string; chatOpen: boolean; onToggleChat: () => void };

export function AppHeader({ title, chatOpen, onToggleChat }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <button
        className={chatOpen ? `${styles.chatToggle} ${styles.chatToggleOn}` : styles.chatToggle}
        aria-label={chatOpen ? "Close chat" : "Open chat"}
        aria-pressed={chatOpen}
        title="Chat with the assistant"
        onClick={onToggleChat}
      >
        <ChatIcon />
      </button>
      <Link className={styles.brand} href="/" aria-label="Amanuensis home">
        <span className={styles.brandMark}>
          <Icon name="music" size={20} />
        </span>
        <span>
          amanuensis<span className={styles.ai}>AI</span>
        </span>
      </Link>
      <div className={styles.breadcrumb}>
        Workspace <span>/</span> <strong>{title}</strong>
      </div>
    </header>
  );
}
