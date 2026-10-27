import { z } from "zod";
import { scoreTools, toolParameters } from "./tool-definitions";
import type { ToolSpec } from "./model-port";

export const askSchema = z.strictObject({
  question: z.string().trim().min(1).max(160).describe("One short musical question."),
  choices: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(4)
    .describe("2–4 concrete answers the musician can tap, e.g. bar numbers or options."),
});

/** Tools that change nothing and end the turn by asking the musician. */
export const ASK_TOOL = "assistant_ask";

/**
 * What the in-app assistant may call. Edits apply directly (the musician has Undo), so the
 * preview/apply pair stays out of this list; that also keeps the prompt about half as large.
 */
export const assistantTools: ToolSpec[] = [
  ...scoreTools.filter((tool) => ["score_get_context", "score_edit", "score_undo"].includes(tool.name)),
  {
    name: ASK_TOOL,
    description:
      "Ask the musician one short question when the target or meaning is genuinely unclear (which bar? which chord?). Give 2–4 tappable choices. Ends your turn.",
    parameters: toolParameters(askSchema),
  },
];
