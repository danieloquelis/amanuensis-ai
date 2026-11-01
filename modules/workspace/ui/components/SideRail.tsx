import Link from "next/link";
import { House, Plus } from "@phosphor-icons/react";
import surface from "@/shared/ui/surface.module.css";
import { BrandMark } from "./BrandMark";
import styles from "./side-rail.module.css";

/**
 * The app's few destinations, down the left edge (across the top on a phone): the mark, a new
 * song, and Home. More belong here only once they exist.
 */
export function SideRail({ onCreate }: { onCreate: () => void }) {
  return (
    <nav className={`${surface.glass} ${styles.rail}`} aria-label="App">
      <BrandMark />
      <button type="button" className={styles.item} onClick={onCreate}>
        <span className={`${styles.icon} ${styles.create}`}>
          <Plus size={20} weight="bold" aria-hidden="true" />
        </span>
        Create
      </button>
      <Link className={styles.item} href="/" aria-current="page">
        <span className={styles.icon}>
          <House size={21} weight="fill" aria-hidden="true" />
        </span>
        Home
      </Link>
    </nav>
  );
}
