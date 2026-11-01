import { z } from "zod";
import {
  anchorIds,
  applyCommand,
  commandSchema,
  positionOf,
  resolvePositions,
  SCORE_VOCABULARY,
  scoreText,
  summarizeChange,
  writeBars,
  type Command,
  operationsTaking,
} from "@/modules/score";
import type { TurnEdits } from "./turn-edits";
import { applyPreviewSchema, readContextSchema, undoSchema, writeSchema, type ScoreToolName } from "./tool-definitions";

const PREVIEW_LIMIT = 128;
const UNSUPPORTED_NOTATION = [
  "more than two voices on a staff in the editor, and moving notes between voices",
  "tuplets other than triplets (3:2), and triplets in 2/2 or compound meters",
  "hairpins",
  "nested repeats and alternate endings",
  "mid-score key, clef or instrument changes",
  "turning sung or beatboxed rhythms into drums",
];

type StoredPreview = { command: Command; applied: boolean };
type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
type ToolHandler = (raw: unknown) => ToolResult;

/**
 * Executes model-requested score tools against one turn's edits. Bind one gateway to one
 * authorized project; the model never chooses the repository. This in-process gateway is
 * single-writer: a server adapter must add authentication and durable idempotency receipts.
 */
export function createScoreToolGateway(edits: TurnEdits) {
  const previews = new Map<string, StoredPreview>();

  /** Commands from the model may name notes and bars by position; they become IDs here. */
  const parseCommand = (raw: unknown): Command => commandSchema.parse(resolvePositions(edits.score(), raw));

  const commit = (command: Command): ToolResult => {
    const before = edits.score();
    edits.execute(command);
    const after = edits.score();
    return { ok: true, revision: after.revision, changes: summarizeChange(before, after) };
  };

  const handlers: Record<ScoreToolName, ToolHandler> = {
    score_get_context(raw) {
      const { selectedIds, includeRaw, parts, bars } = readContextSchema.parse(raw);
      const score = edits.score();
      const valid = new Set([
        ...anchorIds(score.measures),
        ...score.chords.map((c) => c.id),
        ...score.marks.map((m) => m.id),
        ...score.annotations.map((a) => a.id),
        ...score.repeats.map((r) => r.id),
        ...score.slurs.map((s) => s.id),
      ]);
      if (selectedIds.some((id) => !valid.has(id))) throw new Error("Selection contains a missing target.");
      return {
        ok: true,
        revision: score.revision,
        score: scoreText(score, { parts, bars }),
        selected: selectedIds.map((id) => positionOf(score, id)),
        vocabulary: SCORE_VOCABULARY,
        notYetSupported: UNSUPPORTED_NOTATION,
        ...(includeRaw ? { raw: structuredClone(score) } : {}),
      };
    },

    score_edit(raw) {
      return commit(parseCommand(raw));
    },

    score_write(raw) {
      const { expectedRevision, text, requestId, pitches, keepHarmony } = writeSchema.parse(raw);
      if (expectedRevision !== edits.score().revision) {
        throw new Error("The score changed. Read the latest revision before writing.");
      }
      return commit(writeBars(edits.score(), text, requestId, pitches, { keepHarmony }).command);
    },

    score_preview(raw) {
      const command = parseCommand(raw);
      const before = edits.score();
      const proposed = applyCommand(before, command);
      rememberPreview(command.requestId, command);
      return {
        ok: true,
        previewId: command.requestId,
        expectedRevision: before.revision,
        changes: summarizeChange(before, proposed),
        proposed: scoreText(proposed),
      };
    },

    score_apply(raw) {
      const { previewId, expectedRevision } = applyPreviewSchema.parse(raw);
      const preview = previews.get(previewId);
      if (!preview) throw new Error("Preview not found. Preview the operation first.");
      if (expectedRevision !== preview.command.expectedRevision) throw new Error("Preview revision does not match.");
      if (preview.applied) return { ok: true, duplicate: true, revision: edits.score().revision };
      const result = commit(preview.command);
      preview.applied = true;
      return result;
    },

    score_undo(raw) {
      const { expectedRevision } = undoSchema.parse(raw);
      const before = edits.score();
      if (expectedRevision !== before.revision) {
        throw new Error("The score changed. Read the latest revision before undo.");
      }
      const changed = edits.undo();
      const after = edits.score();
      return { ok: true, revision: after.revision, changed, changes: summarizeChange(before, after) };
    },
  };

  /** A preview ID may be re-registered only with the identical command. */
  function rememberPreview(previewId: string, command: Command) {
    const existing = previews.get(previewId);
    if (existing) {
      if (JSON.stringify(existing.command) !== JSON.stringify(command)) {
        throw new Error("Preview ID already used for another command.");
      }
      return;
    }
    if (previews.size >= PREVIEW_LIMIT) throw new Error("Preview limit reached. Start a new tool session.");
    previews.set(previewId, { command, applied: false });
  }

  return (name: string, raw: unknown): ToolResult => {
    try {
      const handler = Object.hasOwn(handlers, name) ? handlers[name as ScoreToolName] : null;
      if (!handler) throw new Error("Unknown score tool.");
      return handler(raw);
    } catch (error) {
      return { ok: false, error: toolError(error) };
    }
  };
}

type Issue = z.core.$ZodIssue;

/**
 * The issue that says what is actually wrong. A union only says "Invalid input"; inside it, the
 * branch the arguments came closest to (their own type, fewest issues) names the missing or wrong field.
 */
function innermost(issue: Issue, path: PropertyKey[] = []): { path: PropertyKey[]; message: string; issue: Issue } {
  const here = [...path, ...issue.path];
  if (issue.code === "invalid_union" && issue.errors.length) {
    // A branch of another type is furthest of all.
    const distance = (issues: Issue[]) => issues.length + (issues.some((i) => i.path.at(-1) === "type") ? 1000 : 0);
    const closest = [...issue.errors].sort((a, b) => distance(a) - distance(b))[0];
    // Unions of plain values (a duration, a pitch) are reported as the field itself.
    if (closest.length && closest[0].path.length) return innermost(closest[0], here);
  }
  return { path: here, message: issue.message, issue };
}

/** For fields an operation doesn't have: the operations that do, so the change can go to the right one. */
function homes(issue: Issue): string {
  if (issue.code !== "unrecognized_keys") return "";
  const places = issue.keys.map((key) => {
    const takers = operationsTaking(key);
    return takers.length ? `"${key}" belongs to ${takers.slice(0, 3).join(" or ")}` : `nothing takes "${key}"`;
  });
  return ` (${places.join("; ")}: put each change in its own operation; a batch holds several)`;
}

/** Zod errors become a readable path and message the model can act on. */
export function toolError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const { path, message, issue } = innermost(error.issues[0]);
    return `Invalid tool arguments at ${path.map(String).join(".") || "(root)"}: ${message}${homes(issue)}`;
  }
  return error instanceof Error ? error.message : "The tool failed.";
}
