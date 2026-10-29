import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/*
 * Visual regression for the engraver. Baselines live next to this file and are per platform.
 * After an intended engraving change, review the diff report, then refresh with:
 *   yarn build && yarn test:e2e engraving --update-snapshots
 */

/** Only the engraving is under test: this stylesheet hides the controls floating over it. */
const HIDE_FLOATING_CONTROLS = "tests/e2e/hide-floating-controls.css";

for (const name of ["dense", "keys", "long", "short", "leadsheet", "ties", "slurs", "trombone", "trumpet"]) {
  test(`engraves the ${name} fixture`, async ({ page }) => {
    const score = readFileSync(`tests/fixtures/engraving/${name}.json`, "utf8");
    await page.addInitScript((value) => localStorage.setItem("amanuensis.score.v1", value), score);
    await page.goto("/");
    const sheet = page.locator("svg[aria-label$='Select a note to edit.']");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveScreenshot(`${name}.png`, {
      animations: "disabled",
      stylePath: HIDE_FLOATING_CONTROLS,
    });
  });
}
