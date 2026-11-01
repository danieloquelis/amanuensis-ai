import Link from "next/link";
import { editedAgo } from "../../application/edited-ago";
import type { Song } from "../../application/songbook";
import { InstrumentStack } from "./InstrumentStack";
import { ScorePreview } from "./ScorePreview";
import { SongMenu } from "./SongMenu";
import styles from "./home.module.css";

type SongCardProps = { song: Song; now: number; onDelete: () => void };

/**
 * A song on Home: its first page on a frosted tile, the title under it, then its instruments (as
 * icons) and when it was last edited. Its "⋯" menu shows on hover (always on touch).
 */
export function SongCard({ song, now, onDelete }: SongCardProps) {
  const { meta, score } = song;
  const href = `/workspace/${meta.id}`;
  const edited = editedAgo(meta.updatedAt, now);
  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} href={href}>
        <span className={styles.tile}>
          <span className={styles.sheet}>
            <span className={styles.sheetTitle}>{meta.title}</span>
            {score ? <ScorePreview score={score} /> : <span className={styles.unreadable}>Could not be read</span>}
          </span>
        </span>
        <span className={styles.cardTitle}>{meta.title}</span>
        <span className={styles.cardMeta}>
          {meta.unreadable ? <span>Left untouched</span> : <InstrumentStack instruments={meta.instruments} />}
          <span>{edited}</span>
        </span>
      </Link>
      <div className={styles.actions}>
        <SongMenu title={meta.title} edited={edited} href={href} onDelete={onDelete} />
      </div>
    </li>
  );
}
