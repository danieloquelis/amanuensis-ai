import Link from "next/link";
import styles from "./workspace.module.css";

/** Top left: the app's mark, and the way home. The score's title lives on the sheet. */
export function BrandMark() {
  return (
    <Link className={styles.brandMark} href="/" aria-label="Amanuensis home">
      <span className={styles.brandLogo} aria-hidden="true" />
    </Link>
  );
}
