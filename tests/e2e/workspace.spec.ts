import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("edit, undo, redo and reload preserve the musical document", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true }).click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, D4, 1 beats", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, D4, 1 beats", exact: true })).toBeVisible();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true });
});

test("shortening a note leaves a rest that becomes a note by typing its letter", async ({ page }) => {
  await page.goto("/");
  const quickBar = page.getByRole("toolbar", { name: "Selected note actions" });
  await page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true }).click();
  await quickBar.getByRole("button", { name: "Half duration", exact: true }).click();
  await expect(page.getByRole("region", { name: "Score workspace" }).getByRole("alert")).toContainText(
    "Make space first",
  );
  await quickBar.getByRole("button", { name: "Eighth duration", exact: true }).click();
  const rest = page.getByRole("button", { name: "Bar 1, beat 1.5, Rest, 0.5 beats", exact: true });
  await rest.click();
  await page.keyboard.press("e");
  const newNote = page.getByRole("button", { name: "Bar 1, beat 1.5, E4, 0.5 beats", exact: true });
  await expect(newNote).toBeVisible();
  await quickBar.getByRole("button", { name: "Make rest", exact: true }).click();
  await expect(rest).toBeVisible();
  await quickBar.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bar 1, beat 1.5, C4, 0.5 beats", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Play score" }).click();
  await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Play score" })).toBeVisible();
});

test("pointer drag and keyboard editing operate on the same note", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true })).toBeEnabled();
  const note = page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true });
  const hit = note.locator("rect");
  await hit.scrollIntoViewIfNeeded();
  const box = (await hit.boundingBox())!;
  const svg = (await page.locator("svg[aria-label*='treble clef']").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - (12 * svg.width) / 900, { steps: 4 });
  await page.mouse.up();
  const edited = page.getByRole("button", { name: "Bar 1, beat 1, E4, 1 beats", exact: true });
  await expect(edited).toBeVisible();
  await edited.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, D4, 1 beats", exact: true })).toBeVisible();
});

test("corrupt local data is preserved and the mobile editor remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("amanuensis.score.v1", "broken draft"));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Score workspace" }).getByRole("alert")).toContainText(
    "left untouched",
  );
  await page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true }).click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => localStorage.getItem("amanuensis.score.v1"))).toBe("broken draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
});

test("native export reopens losslessly and print hides editing controls", async ({ page }) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save a copy" }).click();
  const download = await downloadPromise;
  const score = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(score.measures).toHaveLength(4);
  score.title = "A second idea";
  await page.getByLabel("Open score file").setInputFiles({
    name: "melody.amanuensis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(score)),
  });
  await expect(page.getByRole("textbox", { name: "Score title" })).toHaveValue("A second idea");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "A second idea", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play score" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Note inspector" })).toBeHidden();
});

test("mixed meters, expressive indications and repeats are editable musical state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  await page.getByRole("button", { name: "Select bar 2", exact: true }).click();
  await page.getByRole("button", { name: "Change time signature" }).click();
  await page.getByRole("group", { name: "Time signature" }).getByRole("button", { name: "6/8", exact: true }).click();
  await expect(page.locator('svg [aria-label="Time signature 6/8 at bar 2"]')).toBeVisible();
  // A meter applies until the next change, as in notation editors: set 4/4 again from bar 3.
  await page.getByRole("button", { name: "Select bar 3", exact: true }).click();
  await page.getByRole("button", { name: "Change time signature" }).click();
  await page.getByRole("group", { name: "Time signature" }).getByRole("button", { name: "4/4", exact: true }).click();
  await expect(page.locator('svg [aria-label="Time signature 4/4 at bar 3"]')).toBeVisible();
  await page.getByRole("button", { name: "Select bar 2", exact: true }).click();
  await page.getByRole("button", { name: "Dynamics", exact: true }).click();
  await page.getByRole("button", { name: "Set dynamic f", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Text indications", exact: true }).click();
  await page.getByLabel("Text indication", { exact: true }).fill("espressivo");
  await page.keyboard.press("Enter");
  await expect(page.locator("svg text").filter({ hasText: /^espressivo$/ })).toBeVisible();
  await page.getByRole("button", { name: "Select bar 3", exact: true }).click();
  await page.getByRole("button", { name: "Marks and repeats", exact: true }).click();
  await page.getByRole("button", { name: "End repeat", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('svg [aria-label="Repeat ends at bar 3, 2 passes"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('svg [aria-label="Time signature 6/8 at bar 2"]')).toBeVisible();
  await page.getByRole("button", { name: "Edit indication espressivo", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(page.locator("svg text").filter({ hasText: /^espressivo$/ })).toHaveCount(0);
});
test("empty measures become full-bar rests and allow note entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  await page.getByRole("button", { name: "Select bar 1", exact: true }).click({ button: "right" });
  await page.getByRole("dialog", { name: "Bar actions" }).getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Change time signature" }).click();
  await page.getByRole("group", { name: "Time signature" }).getByRole("button", { name: "6/8", exact: true }).click();
  await page.getByRole("button", { name: "Bar 1, beat 1, Rest, 3 beats", exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, Rest, 3 beats", exact: true })).toBeVisible();
});
test("sheet context actions replace the old note inspector", async ({ page }) => {
  await page.goto("/");
  const note = page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true });
  await note.click();
  await expect(page.getByRole("toolbar", { name: "Selected note actions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit selected note", exact: true })).toHaveCount(0);
  await note.click({ button: "right" });
  const menu = page.getByRole("dialog", { name: "Note actions" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Sharp", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, C♯4, 1 beats", exact: true })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "More note actions", exact: true }).click();
  await menu.getByRole("button", { name: "staccato", exact: true }).click();
  await page.screenshot({ path: "test-results/direct-sheet-editing.png", fullPage: true });
});

test("drag a bar divider, undo it, and restore persisted spacing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  const divider = page.getByRole("slider", { name: "Resize bar 1" });
  const natural = Number(await divider.getAttribute("aria-valuenow"));
  const box = (await divider.boundingBox())!;
  const svg = (await page.locator("svg[aria-label*='treble clef']").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + (40 * svg.width) / 900, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", String(natural + 40));
  await page.reload();
  await expect(divider).toHaveAttribute("aria-valuenow", String(natural + 40));
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", String(natural + 32));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(divider).toHaveAttribute("aria-valuenow", String(natural + 40));
  await divider.click({ button: "right" });
  await page
    .getByRole("dialog", { name: "Bar actions" })
    .getByRole("button", { name: "Reset spacing", exact: true })
    .click();
  await expect(divider).toHaveAttribute("aria-valuenow", String(natural));
});

test("horizontal note drag reorders the bar and Escape cancels a pitch drag", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  const first = page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true });
  const third = page.getByRole("button", { name: "Bar 1, beat 3, G4, 1 beats", exact: true });
  const from = (await first.locator("rect").boundingBox())!;
  const to = (await third.locator("rect").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2 + 12, from.y + from.height / 2, { steps: 8 });
  await page.mouse.up();
  const moved = page.getByRole("button", { name: "Bar 1, beat 3, C4, 1 beats", exact: true });
  await expect(moved).toBeVisible();
  const box = (await moved.locator("rect").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 20, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(moved).toBeVisible();
});

test("a key signature changes the engraving and diatonic steps, not the written pitches", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change key signature" }).click();
  await page.getByRole("button", { name: "D major", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("svg[aria-label*='D major']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change key signature" })).toHaveText("D");
  await page.getByRole("button", { name: "Bar 1, beat 2, E4, 1 beats", exact: true }).click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "Bar 1, beat 2, F♯4, 1 beats", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("svg[aria-label*='C major']")).toBeVisible();
});

test("a selected bar is deleted with the Delete key", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("button", { name: "Bar 2", exact: true });
  const box = (await bar.boundingBox())!;
  await page.mouse.click(box.x + box.width - 6, box.y + box.height - 4);
  await expect(bar).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: "Bar 4", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bar 2, beat 1, G4, 1 beats", exact: true })).toBeVisible();
});

test("a chord progression is typed bar by bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Chord symbols", exact: true }).click();
  const input = page.getByLabel("Chord symbol", { exact: true });
  for (const chord of ["C", "Am7", "Dm7", "G7"]) {
    await input.fill(chord);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  for (const chord of ["C", "Am7", "Dm7", "G7"]) {
    await expect(page.getByRole("button", { name: `Chord ${chord}`, exact: true })).toBeVisible();
  }
});

test("several marks can be added and any one deleted by selecting it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select bar 4", exact: true }).click();
  await page.getByRole("button", { name: "Marks and repeats", exact: true }).click();
  const marks = page.getByRole("group", { name: "Marks" });
  await marks.getByRole("button", { name: "Fine", exact: true }).click();
  await marks.getByRole("button", { name: "D.C. al Fine", exact: true }).click();
  await marks.getByRole("button", { name: "Segno", exact: true }).click();
  await page.keyboard.press("Escape");
  const fine = page.locator("svg").getByRole("button", { name: "Fine", exact: true });
  await expect(fine).toBeVisible();
  await expect(page.locator("svg").getByRole("button", { name: "D.C. al Fine", exact: true })).toBeVisible();
  await fine.click();
  await page.keyboard.press("Delete");
  await expect(fine).toHaveCount(0);
  await expect(page.locator("svg").getByRole("button", { name: "Segno", exact: true })).toBeVisible();
});
