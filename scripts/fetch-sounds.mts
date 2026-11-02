// Instrument samples are not kept in git: only public/sounds/v1/manifest.json (every file's URL,
// size and hash) and CREDITS.md are. This script downloads what the manifest lists into
// public/sounds/v1 and checks each file's hash. Files already present and correct are kept, so it
// is cheap to run again.
//
//   yarn sounds:fetch             download missing files (runs after `yarn install` and before `yarn build`)
//   yarn sounds:fetch --optional  warn instead of failing when offline (used by postinstall)
//   yarn sounds:fetch --update    rebuild the manifest from the sample selection in the playback module
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "public", "sounds", "v1");
const MANIFEST = join(ROOT, "manifest.json");
const PARALLEL_DOWNLOADS = 8;

type Entry = { file: string; url: string; bytes: number; sha256: string; source: string; license: string };
type Source = { id: string; name: string; author: string; license: string; url: string };

const SOURCES: Source[] = [
  {
    id: "splendid-grand-piano",
    name: "Splendid Grand Piano",
    author: "AKAI Professional, via sfzinstruments and smpldsnds",
    license: "Public domain",
    url: "https://github.com/smpldsnds/sfzinstruments-splendid-grand-piano",
  },
  {
    id: "fluidr3-gm",
    name: "FluidR3 GM (guitar, bass, trumpet, flute, trombone, strings)",
    author: "Frank Wen (Fluid R3); converted by Benjamin Gleitzman (midi-js-soundfonts)",
    license: "CC BY 3.0 as published by midi-js-soundfonts; Fluid R3 itself is MIT",
    url: "https://github.com/gleitz/midi-js-soundfonts",
  },
  {
    id: "vcsl",
    name: "Versilian Community Sample Library (drum kit)",
    author: "Versilian Studios (Samuel Gossner); ogg/m4a conversion by smpldsnds",
    license: "CC0 1.0 (public domain dedication)",
    url: "https://github.com/sgossner/VCSL",
  },
];

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The local copy of a file when it matches its hash, otherwise null. */
function localCopy(entry: Pick<Entry, "file" | "sha256">) {
  const path = join(ROOT, entry.file);
  if (!existsSync(path)) return null;
  const data = new Uint8Array(readFileSync(path));
  return sha256(data) === entry.sha256 ? data : null;
}

function save(file: string, data: Uint8Array) {
  const path = join(ROOT, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/** Runs `task` over `items`, a few at a time. */
async function inBatches<T>(items: T[], task: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL_DOWNLOADS)
    await Promise.all(items.slice(i, i + PARALLEL_DOWNLOADS).map(task));
}

async function fetchAll() {
  const { files }: { files: Entry[] } = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const missing = files.filter((entry) => !localCopy(entry));
  await inBatches(missing, async (entry) => {
    const data = await download(entry.url);
    if (sha256(data) !== entry.sha256) throw new Error(`${entry.file} does not match its hash in the manifest`);
    save(entry.file, data);
  });
  const total = files.reduce((sum, e) => sum + e.bytes, 0);
  console.log(`sounds: ${files.length} files ready (${missing.length} downloaded), ${(total / 1e6).toFixed(1)} MB`);
}

async function updateManifest() {
  const { sampleFiles } = await import("@/modules/playback/infrastructure/sound-sources");
  const wanted = sampleFiles();
  const sourceOf = (id: string) => SOURCES.find((s) => s.id === id)!;
  // Files the selection no longer uses are removed, so the folder matches the manifest.
  if (existsSync(MANIFEST)) {
    const previous: { files: Entry[] } = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const kept = new Set(wanted.map((w) => w.file));
    for (const old of previous.files) if (!kept.has(old.file)) rmSync(join(ROOT, old.file), { force: true });
  }
  const entries: Entry[] = [];
  await inBatches(wanted, async ({ file, url, source }) => {
    const path = join(ROOT, file);
    const data = existsSync(path) ? new Uint8Array(readFileSync(path)) : await download(url);
    save(file, data);
    const { license } = sourceOf(source);
    entries.push({ file, url, bytes: data.byteLength, sha256: sha256(data), source, license });
  });
  const order = wanted.map((w) => w.file);
  entries.sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file));
  writeFileSync(MANIFEST, `${JSON.stringify({ files: entries }, null, 2)}\n`);
  writeFileSync(join(ROOT, "CREDITS.md"), credits());
  console.log(`sounds: manifest lists ${entries.length} files`);
}

function credits() {
  return [
    "# Sound credits",
    "",
    "Instrument samples served by Amanuensis from this folder. `manifest.json` lists every file with its source;",
    "`yarn sounds:fetch` downloads them (they are not kept in git).",
    "",
    ...SOURCES.map((s) => `- **${s.name}** (\`${s.id}\`): ${s.author}. License: ${s.license}. ${s.url}`),
    "",
  ].join("\n");
}

const args = process.argv.slice(2);
try {
  await (args.includes("--update") ? updateManifest() : fetchAll());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!args.includes("--optional")) throw error;
  console.warn(`sounds: could not download instrument samples (${message}).`);
  console.warn("sounds: the app plays reference tones until `yarn sounds:fetch` succeeds.");
}
