import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpeechRecognizer } from "../application/speech-port";
import type { SpeechTurn } from "../domain/take";

/**
 * Remembers what the recognizer heard for each recording (by content hash), so testing the
 * agent again on the same take costs only model calls. For development and evaluation.
 */
export function cachedRecognizer(inner: SpeechRecognizer, directory: string): SpeechRecognizer {
  return {
    async transcribe(wav: Uint8Array, hints: string[] = []): Promise<SpeechTurn[]> {
      const key = createHash("sha256").update(wav).update(hints.join("\n")).digest("hex").slice(0, 24);
      const file = join(directory, `${key}.json`);
      const cached = await readFile(file, "utf8").catch(() => null);
      if (cached) return JSON.parse(cached) as SpeechTurn[];
      const turns = await inner.transcribe(wav, hints);
      await mkdir(directory, { recursive: true });
      await writeFile(file, JSON.stringify(turns, null, 2));
      return turns;
    },
  };
}
