import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

const EXAMPLE_JSON = readFileSync("tests/fixtures/example.json", "utf8");
const EXAMPLE_ID = (JSON.parse(EXAMPLE_JSON) as { id: string }).id;

type SeedScore = { id: string };

/** Seeds the example song as a workspace and opens it. Re-seeding is skipped after a reload. */
export async function openExample(page: Page): Promise<void> {
  await page.addInitScript((score: string) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "yes");
    const parsed = JSON.parse(score) as SeedScore;
    const now = Date.now();
    localStorage.setItem(`amanuensis.score.${parsed.id}`, score);
    localStorage.setItem(
      "amanuensis.workspaces.v1",
      JSON.stringify({ order: [parsed.id], times: { [parsed.id]: { createdAt: now, updatedAt: now } } }),
    );
  }, EXAMPLE_JSON);
  await page.goto(`/workspace/${EXAMPLE_ID}`);
}
