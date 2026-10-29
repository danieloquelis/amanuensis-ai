import { test, expect } from "@playwright/test";

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

test("printing shows the sheet with its title and hides editing controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "First light", exact: true })).toBeVisible();
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
  // The same tools sit in the card beside the selected note.
  const card = page.getByRole("toolbar", { name: "Selected note actions" });
  await card.getByRole("button", { name: "staccato", exact: true }).click();
  await expect(card.getByRole("button", { name: "staccato", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  // The tool shows the current key over its name.
  await expect(page.getByRole("button", { name: "Change key signature" })).toHaveText(/^D\s*Key$/);
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

/** The assistant routes stream progress lines and end with the result. */
const streamed = (body: unknown) => ({
  contentType: "application/x-ndjson",
  body: `${JSON.stringify({ type: "progress", event: { stage: "thinking" } })}\n${JSON.stringify({ type: "result", status: 200, body })}\n`,
});

test("the AI applies an instruction as one undoable step", async ({ page }) => {
  // The model is mocked: browser tests never call the real API.
  await page.route("/api/assistant", async (route) => {
    const { score } = route.request().postDataJSON();
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
        steps: 3,
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  const instruction = page.getByLabel("Describe the music");
  await instruction.fill("Add Am7 on beat 3 of bar 2");
  await instruction.press("Enter");
  // Sending opens the chat above the bar.
  const reply = page.getByRole("region", { name: "Chat" });
  await expect(reply.getByText("Added Am7 on beat 3 of bar 2.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Chord Am7", exact: true })).toBeVisible();
  await reply.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chord Am7", exact: true })).toHaveCount(0);
});

test("the AI's question becomes buttons that answer it", async ({ page }) => {
  let calls = 0;
  await page.route("/api/assistant", async (route) => {
    calls++;
    const body =
      calls === 1
        ? {
            reply: "Which bar?",
            question: { text: "Which bar?", choices: ["Bar 1", "Bar 2"] },
            commands: [],
            changes: [],
            steps: 1,
          }
        : { reply: "Repeated bar 2.", question: null, commands: [], changes: [], steps: 1 };
    await route.fulfill(streamed(body));
  });
  await page.goto("/");
  const instruction = page.getByLabel("Describe the music");
  await instruction.fill("repeat that");
  await instruction.press("Enter");
  const reply = page.getByRole("region", { name: "Chat" });
  await reply.getByRole("button", { name: "Bar 2", exact: true }).click();
  await expect(reply.getByText("Repeated bar 2.")).toBeVisible();
});

/** A bar's empty staff, clicked near its corner so the click lands on the bar, not a note. */
const barCorner = { position: { x: 6, y: 6 } };

test("shift-click picks a range of bars, and the compose bar works on just those", async ({ page }) => {
  const asked: { selectedIds: string[]; selectionName?: string }[] = [];
  await page.route("/api/assistant", async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill(streamed({ reply: "Made bars 2–4 slash bars.", question: null, commands: [], changes: [] }));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Change time signature" })).toBeEnabled();
  await page.getByRole("button", { name: "Bar 2", exact: true }).click(barCorner);
  await page.getByRole("button", { name: "Bar 4", exact: true }).click({ ...barCorner, modifiers: ["Shift"] });
  for (const bar of ["Bar 2", "Bar 3", "Bar 4"]) {
    await expect(page.getByRole("button", { name: bar, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  // The selection is in the bar already: no extra click to tell the AI what it is about.
  const compose = page.getByRole("form", { name: "Compose" });
  await expect(compose.getByText("Bars 2–4", { exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const instruction = compose.getByLabel("Describe the music");
  await expect(instruction).toBeFocused();
  await instruction.fill("make these slash bars");
  await instruction.press("Enter");
  const chat = page.getByRole("region", { name: "Chat" });
  await expect(chat.getByText("Made bars 2–4 slash bars.")).toBeVisible();
  await expect(chat.getByText("Bars 2–4", { exact: true })).toBeVisible();
  expect(asked).toEqual([
    expect.objectContaining({ selectedIds: ["bar-2", "bar-3", "bar-4"], selectionName: "Bars 2–4" }),
  ]);
  // The chat can be hidden and brought back from the bar.
  await page.getByRole("button", { name: "Hide chat", exact: true }).first().click();
  await expect(chat).toHaveCount(0);
  await page.getByRole("button", { name: "Show chat", exact: true }).click();
  await expect(chat.getByText("Made bars 2–4 slash bars.")).toBeVisible();
});

test("cmd-click adds a note to the selection, and cmd-clicking it again removes it", async ({ page }) => {
  await page.goto("/");
  const first = page.getByRole("button", { name: "Bar 1, beat 2, E4, 1 beats", exact: true });
  const second = page.getByRole("button", { name: "Bar 3, beat 1, G4, 1 beats", exact: true });
  await first.click();
  await second.click({ modifiers: ["ControlOrMeta"] });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("form", { name: "Compose" }).getByText("2 notes · bars 1, 3", { exact: true }),
  ).toBeVisible();
  await second.click({ modifiers: ["ControlOrMeta"] });
  await expect(second).toHaveAttribute("aria-pressed", "false");
  await expect(first).toHaveAttribute("aria-pressed", "true");
});

test("the compose bar follows the selection, and ⌘K focuses it from anywhere", async ({ page }) => {
  await page.goto("/");
  const compose = page.getByRole("form", { name: "Compose" });
  await expect(compose.getByText("Whole score", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bar 1, beat 1, C4, 1 beats", exact: true }).click();
  await expect(compose.getByText("C4 · bar 1", { exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(compose.getByLabel("Describe the music")).toBeFocused();
});

test("the chat expands into a sidebar that holds the compose bar, and closing it puts the bar back", async ({
  page,
}) => {
  await page.route("/api/assistant", (route) =>
    route.fulfill(streamed({ reply: "Done.", question: null, commands: [], changes: [] })),
  );
  await page.goto("/");
  const instruction = page.getByLabel("Describe the music");
  await instruction.fill("make it brighter");
  await instruction.press("Enter");
  await expect(page.getByRole("region", { name: "Chat" }).getByText("Done.")).toBeVisible();
  await instruction.fill("a half-typed idea");
  await page.getByRole("button", { name: "Expand chat" }).click();
  const sidebar = page.getByRole("complementary", { name: "Chat" });
  await expect(sidebar.getByText("Done.")).toBeVisible();
  // The bar moved into the sidebar, keeping what was typed.
  await expect(sidebar.getByLabel("Describe the music")).toHaveValue("a half-typed idea");
  await sidebar.getByRole("button", { name: "Close chat" }).click();
  await expect(sidebar).toHaveCount(0);
  await expect(page.getByLabel("Describe the music")).toHaveValue("a half-typed idea");
});
