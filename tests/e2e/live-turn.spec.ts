import { test, expect } from "@playwright/test";
import { openExample } from "./workspace-helpers";

const streamed = (body: unknown) => ({
  status: 200,
  contentType: "application/x-ndjson",
  body: `${JSON.stringify({ type: "progress", event: { stage: "thinking" } })}\n${JSON.stringify({ type: "result", status: 200, body })}\n`,
});

test("while the assistant works the sheet shows it and stays locked, then its edits land as one undo", async ({
  page,
}) => {
  // The model is mocked, and its answer is held back until the test has looked at the sheet.
  let answer: () => void = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route("/api/assistant", async (route) => {
    const { score } = route.request().postDataJSON();
    await answered;
    await route.fulfill(
      streamed({
        reply: "Added Am7 on beat 3 of bar 2.",
        question: null,
        commands: [
          {
            requestId: "mock-chord",
            expectedRevision: score.revision,
            operation: { type: "putChord", measureId: "bar-2", beat: 2, symbol: "Am7" },
          },
        ],
        changes: ["Bar 2: changed"],
        steps: 2,
      }),
    );
  });
  await openExample(page);
  const meter = page.getByRole("button", { name: "Change time signature" });
  await expect(meter).toBeEnabled();
  const instruction = page.getByLabel("Describe the music");
  await instruction.fill("Add Am7 on beat 3 of bar 2");
  await instruction.press("Enter");

  const sheet = page.getByRole("article", { name: "Music sheet" });
  await expect(sheet.locator("[aria-busy='true']")).toHaveCount(1);
  await expect(meter).toBeDisabled();

  answer();
  await expect(page.getByRole("button", { name: "Chord Am7", exact: true })).toBeVisible();
  await expect(sheet.locator("[aria-busy='true']")).toHaveCount(0);
  await expect(meter).toBeEnabled();
  await page.getByRole("region", { name: "Chat" }).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chord Am7", exact: true })).toHaveCount(0);
});

test("Stop ends a running turn and unlocks the score", async ({ page }) => {
  // The model never answers: only Stop ends this turn.
  await page.route("/api/assistant", () => new Promise(() => {}));
  await openExample(page);
  const meter = page.getByRole("button", { name: "Change time signature" });
  const instruction = page.getByLabel("Describe the music");
  await instruction.fill("Write a long melody");
  await instruction.press("Enter");
  await expect(meter).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("region", { name: "Chat" }).getByText("Stopped.")).toBeVisible();
  await expect(meter).toBeEnabled();
  await expect(page.getByRole("article", { name: "Music sheet" }).locator("[aria-busy='true']")).toHaveCount(0);
});
