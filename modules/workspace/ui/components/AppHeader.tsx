import Link from "next/link";
import { Icon } from "@/shared/ui/Icon";
import styles from "./workspace.module.css";

export function AppHeader({ title }: { title: string }) {
  return (
    <header className={styles.header}>
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
      <div className={styles.headerRight}>
        <span className={styles.edition}>EARLY STUDIO</span>
        <span className={styles.avatar} title="Local workspace">
          a.
        </span>
      </div>
    </header>
  );
}
