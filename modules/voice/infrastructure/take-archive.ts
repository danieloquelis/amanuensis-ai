import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Keeps a recorded take with what the assistant made of it, building the local test corpus
 * as the musician uses the app. Add a `truth.json` next to it to score the take.
 * For development only: recordings are personal and never leave the machine.
 */
export async function archiveTake(directory: string, audio: Uint8Array, result: unknown): Promise<string> {
  const folder = join(directory, new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "take.wav"), audio);
  await writeFile(join(folder, "result.json"), JSON.stringify(result, null, 2));
  return folder;
}
