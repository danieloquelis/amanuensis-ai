"use client";

import Link from "next/link";
import { FilePlus, Trash } from "@phosphor-icons/react";
import type { WorkspaceMeta } from "@/modules/projects";
import { IconButton } from "@/shared/ui/IconButton";
import { useSongbook } from "../hooks/use-songbook";
import { BrandMark } from "./BrandMark";
import { ScorePreview } from "./ScorePreview";
import styles from "./home.module.css";

const dateOf = (time: number) =>
  new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const summaryOf = (workspace: WorkspaceMeta) =>
  workspace.unreadable
    ? "Could not be read · left untouched"
    : `${workspace.bars} bars · ${workspace.tempo} bpm · ${workspace.instruments.join(", ")}`;

/** Home: every song on this device as its title page, newest first. Creating never touches the others. */
export function HomeScreen() {
  const { songs, armed, create, remove, disarm } = useSongbook();

  return (
    <main className={styles.home} aria-label="Songs">
      <header className={styles.header}>
        <BrandMark />
        <h1 className={styles.title}>Songs</h1>
        <button type="button" className={styles.create} onClick={create}>
          <FilePlus size={18} weight="bold" aria-hidden="true" /> New song
        </button>
      </header>
      {songs.length > 0 && (
        <p className={styles.subline}>
          {songs.length} {songs.length === 1 ? "song" : "songs"} · saved on this device
        </p>
      )}
      {songs.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No songs yet</p>
          <p className={styles.emptyText}>Start one — it stays on this device, and the next ones join it here.</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {songs.map(({ meta: workspace, score }) => (
            <li key={workspace.id} className={styles.card}>
              <Link className={styles.cardLink} href={`/workspace/${workspace.id}`}>
                <div className={styles.previewFrame}>{score && <ScorePreview score={score} />}</div>
                <span className={styles.cardTitle}>{workspace.title}</span>
                <span className={styles.cardMeta}>{summaryOf(workspace)}</span>
              </Link>
              <div className={styles.cardFoot}>
                <span>
                  Updated {dateOf(workspace.updatedAt)} · started {dateOf(workspace.createdAt)}
                </span>
                <IconButton
                  label={armed === workspace.id ? `Confirm removing ${workspace.title}` : `Remove ${workspace.title}`}
                  tooltip={armed === workspace.id ? "Click again to remove" : "Remove"}
                  aria-pressed={armed === workspace.id}
                  onClick={() => remove(workspace.id)}
                  onBlur={disarm}
                >
                  <Trash size={18} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
