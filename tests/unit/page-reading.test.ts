import { test } from "node:test";
import assert from "node:assert/strict";
import { compareHeads, readPage } from "@/modules/page";
import { drawPage, fakeImages, SPACE } from "../support/synthetic-page";

// Two bars on a treble staff: E4 G4 | B4 and the chord C5 E5 |.
const page = drawPage(
  [
    { x: 7 * SPACE, positions: [0] },
    { x: 10 * SPACE, positions: [2] },
    { x: 16 * SPACE, positions: [4] },
    { x: 20 * SPACE, positions: [5, 7] },
  ],
  [13 * SPACE, 26 * SPACE],
);

test("the page reader finds the staff, names every head on its clef, and splits it at the barlines", async () => {
  const { images, drawn } = fakeImages(page);
  const reading = await readPage(images, new Uint8Array(), ["treble"]);
  assert.ok(reading.ok);
  assert.equal(reading.text, "staff 1 (treble): E4 G4 | B4 <C5 E5> |");
  // Each bar's columns, a chord's heads together.
  assert.deepEqual(reading.bars, [
    [
      [["E4"], ["G4"]],
      [["B4"], ["C5", "E5"]],
    ],
  ]);
  assert.deepEqual(drawn.sort(), ["B4", "C5", "E4", "E5", "G4"]);
});

test("the same heads on a bass staff are named on its clef", async () => {
  const reading = await readPage(fakeImages(page).images, new Uint8Array(), ["bass"]);
  assert.ok(reading.ok);
  assert.equal(reading.text, "staff 1 (bass): G2 B2 | D3 <E3 G3> |");
});

test("a page whose staves differ from the reading is not labelled, and says why", async () => {
  const reading = await readPage(fakeImages(page).images, new Uint8Array(), ["treble", "bass"]);
  assert.equal(reading.ok, false);
  assert.match((reading as { reason: string }).reason, /1 staves; the reading gave clefs for 2/);
});

test("one system's clefs stand for every system of the page", async () => {
  const twoSystems = { ...page, data: new Uint8Array([...page.data, ...page.data]), height: page.height * 2 };
  const reading = await readPage(fakeImages(twoSystems).images, new Uint8Array(), ["treble"]);
  assert.ok(reading.ok);
  assert.equal(reading.staves, 2);
  assert.equal(reading.text, "staff 1 (treble): E4 G4 | B4 <C5 E5> |\nstaff 2 (treble): E4 G4 | B4 <C5 E5> |");
});

test("heads are listed bar by bar, spelled in the key signature", async () => {
  const reading = await readPage(fakeImages(page).images, new Uint8Array(), ["treble"], { perSystem: 1, fifths: -3 });
  assert.ok(reading.ok);
  assert.equal(
    reading.text,
    "page bar 1 (system 1)\n  staff 1, treble: Eb4 G4\npage bar 2\n  staff 1, treble: Bb4 <C5 Eb5>",
  );
});

test("a bar's written notes are compared with its heads, counting repeats", () => {
  assert.deepEqual(compareHeads(["G5", "G5", "F5"], ["G5", "F5", "D6"]), { missing: ["G5"], extra: ["D6"] });
});
