import { UsersThree } from "@phosphor-icons/react";
import styles from "./assistant.module.css";

/**
 * Band Mode in the compose bar: one press turns it on or off. On, music several parts play goes to
 * a band the assistant puts together itself (one musician per part, the song's own parts included);
 * small edits stay with the assistant.
 */
export function BandMenu({ on, onTurn }: { on: boolean; onTurn: (on: boolean) => void }) {
  const label = on
    ? "Band Mode is on: the assistant puts a band together for arrangements"
    : "Band Mode: let a band of musicians play arrangements";
  return (
    <button
      type="button"
      className={styles.bandButton}
      data-on={on}
      aria-pressed={on}
      aria-label="Band Mode"
      title={label}
      onClick={() => onTurn(!on)}
    >
      <UsersThree size={18} weight={on ? "fill" : "regular"} aria-hidden="true" />
      <span className={styles.bandLabel}>Band</span>
    </button>
  );
}
