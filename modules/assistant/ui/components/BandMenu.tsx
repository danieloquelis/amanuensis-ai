import { InstrumentIcon } from "@/modules/editor/ui";
import type { InstrumentId } from "@/modules/score";
import styles from "./assistant.module.css";

/** The band the button pictures, as a little triangle: piano on top, drums and bass below. */
const PICTURED: InstrumentId[] = ["piano", "drums", "bass"];

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
      <span className={styles.bandTriangle} aria-hidden="true">
        {PICTURED.map((instrument) => (
          <span key={instrument}>
            <InstrumentIcon instrument={instrument} size={9} />
          </span>
        ))}
      </span>
      <span className={styles.bandLabel}>Band</span>
    </button>
  );
}
