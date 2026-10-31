"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FilePlus, Trash } from "@phosphor-icons/react";
import { adoptLegacyChat, removeWorkspaceChat } from "@/modules/assistant";
import { createWorkspaceScore, localWorkspaceRepository, type WorkspaceMeta } from "@/modules/projects";
import { IconButton } from "@/shared/ui/IconButton";
import { BrandMark } from "./BrandMark";
import { ScorePreview } from "./ScorePreview";
import styles from "./home.module.css";

const dateOf = (time: number) =>
  new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const summaryOf = (workspace: WorkspaceMeta) =>
  `${workspace.bars} bars · ${workspace.tempo} bpm · ${workspace.instruments.join(", ")}`;

/** Home: every song on this device as its title page, newest first. Creating never touches the others. */
export function HomeScreen() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const adopted = localWorkspaceRepository.adoptLegacy();
      if (adopted) adoptLegacyChat(adopted);
      setWorkspaces(localWorkspaceRepository.list());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const create = () => {
    const id = crypto.randomUUID();
    localWorkspaceRepository.save(id, createWorkspaceScore(crypto.randomUUID()));
    router.push(`/workspace/${id}`);
  };

  const remove = (id: string) => {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    localWorkspaceRepository.remove(id);
    removeWorkspaceChat(id);
    setConfirming(null);
    setWorkspaces(localWorkspaceRepository.list());
  };

  return (
    <main className={styles.home} aria-label="Songs">
      <header className={styles.header}>
        <BrandMark />
        <h1 className={styles.title}>Songs</h1>
        <button type="button" className={styles.create} onClick={create}>
          <FilePlus size={18} weight="bold" aria-hidden="true" /> New song
        </button>
      </header>
      {workspaces.length > 0 && (
        <p className={styles.subline}>
          {workspaces.length} {workspaces.length === 1 ? "song" : "songs"} · saved on this device
        </p>
      )}
      {workspaces.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing on the stand yet.</p>
          <p className={styles.emptyText}>Start one — it stays on this device, and the next ones join it here.</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {workspaces.map((workspace) => (
            <li key={workspace.id} className={styles.card}>
              <Link className={styles.cardLink} href={`/workspace/${workspace.id}`}>
                <ScorePreview workspaceId={workspace.id} />
                <span className={styles.cardTitle}>{workspace.title}</span>
                <span className={styles.cardMeta}>{summaryOf(workspace)}</span>
              </Link>
              <div className={styles.cardFoot}>
                <span>
                  Updated {dateOf(workspace.updatedAt)} · started {dateOf(workspace.createdAt)}
                </span>
                <IconButton
                  label={
                    confirming === workspace.id ? `Confirm removing ${workspace.title}` : `Remove ${workspace.title}`
                  }
                  tooltip={confirming === workspace.id ? "Click again to remove" : "Remove"}
                  aria-pressed={confirming === workspace.id}
                  onClick={() => remove(workspace.id)}
                  onBlur={() => setConfirming(null)}
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
