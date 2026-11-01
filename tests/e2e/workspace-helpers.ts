import type { Page } from "@playwright/test";
import { createExample } from "@/modules/score";

/** The workspace the example song is seeded under: its own id, not the score's. */
export const EXAMPLE_WORKSPACE = "e2e-song";

/** Seeds the example song as a workspace and opens it. Re-seeding is skipped after a reload. */
export async function openExample(page: Page): Promise<void> {
  await page.addInitScript(
    ({ id, score }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "yes");
      const now = Date.now();
      localStorage.setItem(`amanuensis.score.${id}`, score);
      localStorage.setItem(
        "amanuensis.workspaces.v1",
        JSON.stringify({ order: [id], times: { [id]: { createdAt: now, updatedAt: now } } }),
      );
    },
    { id: EXAMPLE_WORKSPACE, score: JSON.stringify(createExample()) },
  );
  await page.goto(`/workspace/${EXAMPLE_WORKSPACE}`);
}
