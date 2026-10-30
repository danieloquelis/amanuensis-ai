import type { PageImages } from "@/modules/page";
import type { Score } from "@/modules/score";
import type { Attachment } from "./attachments";
import type { ContentPart, ToolSpec } from "./model-port";
import { checkPage } from "./page-check-tool";
import { toolError } from "./score-tool-gateway";
import type { ScoreWriter } from "./score-setup";
import { readSource, type SourceState } from "./source-reading-tool";
import { pageCheckSchema, readSourceSchema } from "./source-tool-schemas";
import { toolParameters } from "./tool-definitions";

export const SOURCE_TOOL_NAMES = ["music_read_source", "page_check"] as const;
export type SourceToolName = (typeof SOURCE_TOOL_NAMES)[number];
type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** Tools that write: in a turn with attached music, only after it was read. */
const WRITES = ["score_write", "score_edit"];
const READ_FIRST =
  "Read the attached music first: call music_read_source with your reading (and every picture's staves).";

const specs: ToolSpec[] = [
  {
    name: "music_read_source",
    description:
      "Your reading of the attached music, before writing anything: what it is, parts, key, meter, tempo, pickup, bars, form, what the score can't hold, unclear spots, and the clef of every staff on each picture. Returns what fits, how to approximate the rest, and for each picture the noteheads found by a detector, as text (the labelled pictures follow). Required before score_write or score_edit in this turn.",
    parameters: toolParameters(readSourceSchema),
  },
  {
    name: "page_check",
    description:
      "After writing a picture's music: compares the bars written with the heads the detector found on that page, bar by bar and staff by staff, and lists the differences (heads you missed or misplaced, notes with no head). Fix your misreadings with score_write, then check again if you changed much.",
    parameters: toolParameters(pageCheckSchema),
  },
];

/** Tools for this turn: only when music is attached. */
export const sourceToolSpecs = (hasAttachments: boolean): ToolSpec[] => (hasAttachments ? specs : []);

export const isSourceTool = (name: string): name is SourceToolName =>
  (SOURCE_TOOL_NAMES as readonly string[]).includes(name);

/**
 * Reading attached music in one turn: the reading (with the notehead detector on each picture),
 * the check against the page, and the rule that a turn with attachments reads before it writes.
 * `show` adds pictures to the conversation (the API takes them only in user messages).
 */
export function createSourceTools(
  attachments: Attachment[],
  images: PageImages | null,
  getScore: () => Score,
  show: (parts: ContentPart[]) => void,
  commit: ScoreWriter["commit"] | null = null,
) {
  const state: SourceState = { read: false, pages: new Map() };
  return {
    /** The refusal for a write that comes before the reading, or null when it may go ahead. */
    refuseUnread(name: string): ToolResult | null {
      return attachments.length && !state.read && WRITES.includes(name) ? { ok: false, error: READ_FIRST } : null;
    },
    async run(name: SourceToolName, raw: unknown): Promise<ToolResult> {
      try {
        if (name === "music_read_source") {
          const writer = commit ? { get: getScore, commit } : null;
          return await readSource(raw, attachments, images, state, show, writer);
        }
        return checkPage(raw, getScore(), state);
      } catch (error) {
        return { ok: false, error: toolError(error) };
      }
    },
  };
}
