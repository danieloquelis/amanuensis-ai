import { z } from "zod";
import {
  anchorIds,
  applyCommand,
  commandSchema,
  describeScore,
  execute,
  SCORE_VOCABULARY,
  summarizeChange,
  travel,
  type Command,
  type Session,
} from "@/modules/score";
import { applyPreviewSchema, readContextSchema, undoSchema, type ScoreToolName } from "./tool-definitions";

const PREVIEW_LIMIT = 128;
const UNSUPPORTED_NOTATION = [
  "polyphony and chords in the melody staff",
  "tuplets",
  "ties and slurs",
  "hairpins",
  "nested repeats and alternate endings",
  "mid-score key or clef changes",
];

type StoredPreview = { command: Command; applied: boolean };
type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
type ToolHandler = (raw: unknown) => ToolResult;

/**
 * Executes model-requested score tools against one session. Bind one gateway to one authorized
 * project; the model never chooses the repository. This in-process gateway is single-writer:
 * a server adapter must add authentication and durable idempotency receipts.
 */
export function createScoreToolGateway(getSession: () => Session, setSession: (session: Session) => void) {
  const previews = new Map<string, StoredPreview>();

  const commit = (command: Command): ToolResult => {
    const session = getSession();
    const next = execute(session, command);
    setSession(next);
    return { ok: true, revision: next.score.revision, changes: summarizeChange(session.score, next.score) };
  };

  const handlers: Record<ScoreToolName, ToolHandler> = {
    score_get_context(raw) {
      const { selectedIds, includeRaw } = readContextSchema.parse(raw);
      const { score } = getSession();
      const valid = new Set([
        ...anchorIds(score.measures),
        ...score.chords.map((c) => c.id),
        ...score.marks.map((m) => m.id),
        ...score.annotations.map((a) => a.id),
        ...score.repeats.map((r) => r.id),
      ]);
      if (selectedIds.some((id) => !valid.has(id))) throw new Error("Selection contains a missing target.");
      return {
        ok: true,
        revision: score.revision,
        score: describeScore(score),
        selectedIds,
        vocabulary: SCORE_VOCABULARY,
        notYetSupported: UNSUPPORTED_NOTATION,
        ...(includeRaw ? { raw: structuredClone(score) } : {}),
      };
    },

    score_edit(raw) {
      return commit(commandSchema.parse(raw));
    },

    score_preview(raw) {
      const command = commandSchema.parse(raw);
      const before = getSession().score;
      const proposed = applyCommand(before, command);
      rememberPreview(command.requestId, command);
      return {
        ok: true,
        previewId: command.requestId,
        expectedRevision: before.revision,
        changes: summarizeChange(before, proposed),
        proposed: describeScore(proposed),
      };
    },

    score_apply(raw) {
      const { previewId, expectedRevision } = applyPreviewSchema.parse(raw);
      const preview = previews.get(previewId);
      if (!preview) throw new Error("Preview not found. Preview the operation first.");
      if (expectedRevision !== preview.command.expectedRevision) throw new Error("Preview revision does not match.");
      if (preview.applied) return { ok: true, duplicate: true, revision: getSession().score.revision };
      const result = commit(preview.command);
      preview.applied = true;
      return result;
    },

    score_undo(raw) {
      const { expectedRevision } = undoSchema.parse(raw);
      const session = getSession();
      if (expectedRevision !== session.score.revision) {
        throw new Error("The score changed. Read the latest revision before undo.");
      }
      const next = travel(session, "undo");
      setSession(next);
      return {
        ok: true,
        revision: next.score.revision,
        changed: next !== session,
        changes: summarizeChange(session.score, next.score),
      };
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

/** Zod errors become a readable path and message the model can act on. */
export function toolError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return `Invalid tool arguments at ${issue.path.join(".") || "(root)"}: ${issue.message}`;
  }
  return error instanceof Error ? error.message : "The tool failed.";
}
