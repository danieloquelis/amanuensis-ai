import { scoreToMidi } from "@/modules/playback";
import { scoreToMusicXml, type Score } from "@/modules/score";
import { downloadFile } from "@/shared/ui/download";

/** What a song can be saved as, for other tools: MusicXML for notation apps, MIDI for audio ones. */
export type SongFile = "musicxml" | "midi";

export const SONG_FILES: Record<SongFile, { label: string; hint: string }> = {
  musicxml: { label: "MusicXML", hint: "For MuseScore, Sibelius, Dorico" },
  midi: { label: "MIDI", hint: "For GarageBand, Logic or a DAW" },
};

/** A file name from the song's title: "First light.musicxml". */
const fileName = (title: string, extension: string) =>
  `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Song"}.${extension}`;

/** Downloads the song as a MusicXML or MIDI file. */
export function downloadSong(score: Score, file: SongFile): void {
  if (file === "musicxml") {
    downloadFile(fileName(score.title, "musicxml"), scoreToMusicXml(score), "application/vnd.recordare.musicxml+xml");
  } else {
    downloadFile(fileName(score.title, "mid"), scoreToMidi(score) as Uint8Array<ArrayBuffer>, "audio/midi");
  }
}

/** Prints the song from its own page, where the print layout lives: the print dialog saves it as a PDF. */
export const printSongHref = (workspaceId: string) => `/workspace/${workspaceId}?print=1`;
