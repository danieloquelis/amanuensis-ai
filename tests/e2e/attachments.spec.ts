import { test, expect } from "@playwright/test";
import { openExample } from "./workspace-helpers";

/** A one-pixel PNG: a picture the browser can decode, small enough to send as it is. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const streamed = (body: unknown) => ({
  status: 200,
  contentType: "application/x-ndjson",
  body: `${JSON.stringify({ type: "result", status: 200, body })}\n`,
});

test("an attached page is sent with the request, and the reply's commands apply", async ({ page }) => {
  // The model is mocked: browser tests never call the real API.
  let sent: { multipart: boolean; body: string } | null = null;
  await page.route("/api/assistant", async (route) => {
    const request = route.request();
    const body = request.postDataBuffer()?.toString("latin1") ?? "";
    sent = { multipart: (request.headers()["content-type"] ?? "").startsWith("multipart/form-data"), body };
    const revision = Number(/"revision":(\d+)/.exec(body)?.[1] ?? 0);
    await route.fulfill(
      streamed({
        reply: "Wrote the chords from your page.",
        question: null,
        commands: [
          {
            requestId: "mock-chord",
            expectedRevision: revision,
            operation: { type: "putChord", measureId: "bar-2", beat: 0, symbol: "Am7" },
          },
        ],
        changes: ["Bar 2: changed"],
        steps: 2,
      }),
    );
  });
  await openExample(page);
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  await page
    .getByRole("form", { name: "Compose" })
    .locator("input[type=file]")
    .setInputFiles({ name: "page.png", mimeType: "image/png", buffer: PIXEL });
  const waiting = page.getByRole("list", { name: "Attached files" });
  await expect(waiting.getByText("page.png")).toBeVisible();
  // Files alone are a request: the send button appears without words.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const chat = page.getByRole("region", { name: "Chat" });
  await expect(chat.getByText("Wrote the chords from your page.")).toBeVisible();
  await expect(chat.getByLabel("Attached files").getByText("page.png")).toBeVisible();
  await expect(waiting).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chord Am7", exact: true })).toBeVisible();
  expect(sent!.multipart).toBe(true);
  expect(sent!.body).toContain('filename="page.png"');
  expect(sent!.body).toContain('name="request"');
});
