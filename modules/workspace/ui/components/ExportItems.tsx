import { FileText, MusicNotes, Printer, Waveform } from "@phosphor-icons/react";
import { SONG_FILES, type SongFile } from "../export-song";
import styles from "./song-menu.module.css";

const ICONS: Record<SongFile, typeof MusicNotes> = { musicxml: MusicNotes, midi: Waveform };

type ExportItemsProps = {
  /** Opens the print dialog (where Save as PDF is), on this page or the song's own. */
  onPrint: () => void;
  onDownload: (file: SongFile) => void;
  close: () => void;
};

/** The menu items that save a song for elsewhere: a PDF (through print), MusicXML and MIDI. */
export function ExportItems({ onPrint, onDownload, close }: ExportItemsProps) {
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={() => {
          close();
          onPrint();
        }}
      >
        <Printer size={18} aria-hidden="true" />
        <span className={styles.label}>
          Save as PDF…<span className={styles.hint}>Print, or save the sheet as a PDF</span>
        </span>
      </button>
      {(Object.keys(SONG_FILES) as SongFile[]).map((file) => {
        const Icon = ICONS[file] ?? FileText;
        return (
          <button
            key={file}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              close();
              onDownload(file);
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span className={styles.label}>
              Download {SONG_FILES[file].label}
              <span className={styles.hint}>{SONG_FILES[file].hint}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}
