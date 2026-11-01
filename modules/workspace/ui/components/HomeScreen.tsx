"use client";

import { StartComposer } from "@/modules/assistant/ui";
import { useSongbook } from "../hooks/use-songbook";
import { SideRail } from "./SideRail";
import { SongCard } from "./SongCard";
import styles from "./home.module.css";

/**
 * Home, in the page's wash without the editor's dot grid: the rail on the left (Create starts a blank
 * song), the compose bar up top (what is sent there starts a new song with it), then every song on
 * this device, most recently edited first.
 */
export function HomeScreen() {
  const { songs, now, loaded, create, start, remove } = useSongbook();
  return (
    <div className={styles.home}>
      <SideRail onCreate={create} />
      <main className={styles.content} aria-label="Songs">
        <header className={styles.hero}>
          <h1 className={styles.question}>What will you write today?</h1>
          <StartComposer onStart={start} />
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
