import { test, expect } from "@playwright/test";
import { openExample } from "./workspace-helpers";

test("a song downloads as MusicXML or MIDI, prints system by system, and Home makes a copy of it", async ({ page }) => {
  await openExample(page);
  await expect(page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true })).toBeVisible();
  // Top right, beside undo and redo: the song as files for other tools.
  await page.getByRole("button", { name: "Save or export" }).click();
  const menu = page.getByRole("menu", { name: "Save or export" });
  await expect(menu.getByRole("menuitem", { name: /Save as PDF/ })).toBeVisible();
  const xml = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: /Download MusicXML/ }).click();
  expect((await xml).suggestedFilename()).toBe("First light.musicxml");
  await page.getByRole("button", { name: "Save or export" }).click();
  const midi = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: /Download MIDI/ }).click();
  expect((await midi).suggestedFilename()).toBe("First light.mid");
  // Printing (where Save as PDF is) draws the sheet system by system, titled after the song.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page).toHaveTitle("First light");
  await expect(page.locator("[class*=printSystem] svg")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("[class*=printSystem]")).toHaveCount(0);
  // On Home, a song's menu makes a copy of it, listed first.
  await page.goto("/");
  const song = page.getByRole("link", { name: /First light/ }).first();
  await song.hover();
  await page.getByRole("button", { name: "More actions for First light" }).click();
  await page.getByRole("menu", { name: "First light" }).getByRole("menuitem", { name: "Make a copy" }).click();
  await expect(page.getByRole("link", { name: /First light \(copy\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /First light/ })).toHaveCount(2);
});
