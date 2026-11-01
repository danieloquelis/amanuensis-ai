"use client";

import { Plus } from "@phosphor-icons/react";
import surface from "@/shared/ui/surface.module.css";
import { useSongbook } from "../hooks/use-songbook";
import { SideRail } from "./SideRail";
import { SongCard } from "./SongCard";
import styles from "./home.module.css";

/**
 * Home, in the editor's light without its dot grid: the rail on the left, one question and one
 * action up top, then every song on this device, most recently edited first.
 */
export function HomeScreen() {
  const { songs, now, loaded, create, remove } = useSongbook();
  return (
    <div className={`${styles.home} ${surface.wash}`}>
      <SideRail onCreate={create} />
      <main className={styles.content} aria-label="Songs">
        <header className={styles.hero}>
          <h1 className={styles.question}>What will you write today?</h1>
          <p className={styles.lede}>Sing it, hum it, or describe it. Every song stays on this device.</p>
          <button type="button" className={styles.create} onClick={create}>
            <Plus size={18} weight="bold" aria-hidden="true" />
            New song
          </button>
        </header>
        {loaded && songs.length > 0 && (
          <section className={styles.songs} aria-labelledby="songs-heading">
            <h2 id="songs-heading" className={styles.sectionTitle}>
              Continue writing
            </h2>
            <ul className={styles.grid}>
              {songs.map((song) => (
                <SongCard key={song.meta.id} song={song} now={now} onDelete={() => remove(song.meta.id)} />
              ))}
            </ul>
          </section>
        )}
        {loaded && songs.length === 0 && <p className={styles.empty}>No songs yet. Your first one will wait here.</p>}
      </main>
    </div>
  );
}
