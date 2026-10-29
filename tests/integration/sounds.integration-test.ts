import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The downloaded sample files against their committed manifest (local files, no network; `yarn
// sounds:fetch` downloads them after `yarn install`).

const ROOT = join(import.meta.dirname, "..", "..", "public", "sounds", "v1");
/** Every sample set together (piano, the wind and guitar sounds, drums) stays under this. */
const BUDGET_BYTES = 25_000_000;
const OWN_FILES = new Set(["manifest.json", "CREDITS.md"]);

type Entry = { file: string; bytes: number; sha256: string; source: string; license: string };
const manifest: { files: Entry[] } = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [relative(ROOT, path)];
  });

test("every manifest file is present with its size and hash", () => {
  for (const entry of manifest.files) {
    assert.ok(existsSync(join(ROOT, entry.file)), `${entry.file} is missing: run yarn sounds:fetch`);
    const data = readFileSync(join(ROOT, entry.file));
    assert.equal(data.byteLength, entry.bytes, entry.file);
    assert.equal(createHash("sha256").update(data).digest("hex"), entry.sha256, entry.file);
  }
});

test("the sample sets stay within the size budget", () => {
  const total = manifest.files.reduce((sum, e) => sum + e.bytes, 0);
  assert.ok(total < BUDGET_BYTES, `${(total / 1e6).toFixed(1)} MB`);
});

test("the credits name every source in the manifest", () => {
  const credits = readFileSync(join(ROOT, "CREDITS.md"), "utf8");
  for (const source of new Set(manifest.files.map((e) => e.source))) assert.ok(credits.includes(source), source);
});

test("no file is served from the sounds folder without a manifest entry", () => {
  const listed = new Set(manifest.files.map((e) => e.file));
  const stray = filesUnder(ROOT).filter((file) => !listed.has(file) && !OWN_FILES.has(file));
  assert.deepEqual(stray, []);
});
