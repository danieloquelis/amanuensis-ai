import { InstrumentIcon } from "@/modules/editor/ui";
import type { WorkspaceMeta } from "@/modules/projects";
import styles from "./home.module.css";

/** Past this many, the rest are counted ("+2") instead of drawn. */
const MAX_SHOWN = 4;
const ICON_SIZE = 15;

/** A song's instruments as round icons overlapping like avatars; their names are in the label. */
export function InstrumentStack({ instruments }: { instruments: WorkspaceMeta["instruments"] }) {
  const names = instruments.map((part) => part.name).join(", ");
  const shown = instruments.slice(0, MAX_SHOWN);
  const rest = instruments.length - shown.length;
  return (
    <span className={styles.stack} role="img" aria-label={names} title={names}>
      {shown.map((part, index) => (
        <span key={index} className={styles.stackItem}>
          <InstrumentIcon instrument={part.instrument} size={ICON_SIZE} />
        </span>
      ))}
      {rest > 0 && <span className={`${styles.stackItem} ${styles.stackMore}`}>+{rest}</span>}
    </span>
  );
}
