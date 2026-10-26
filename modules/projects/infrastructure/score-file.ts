import type { Score } from "@/modules/score";

const MAX_FILE_BYTES = 1_000_000;

/** Downloads the lossless native JSON file. */
export function downloadScoreFile(score: Score) {
  const blob = new Blob([JSON.stringify(score, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${score.title.replace(/[^a-z0-9 -]/gi, "").trim() || "score"}.amanuensis.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a chosen file as JSON. Validation is the caller's job (`parseScore`). */
export async function readScoreFile(file: File): Promise<unknown> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose an Amanuensis score smaller than 1 MB.");
  return JSON.parse(await file.text());
}
