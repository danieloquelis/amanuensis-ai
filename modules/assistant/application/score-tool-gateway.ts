import { z } from "zod";
import { anchorIds, applyCommand, commandSchema, execute, travel, type Command, type Session } from "@/modules/score";
import { applyPreviewSchema, readContextSchema, undoSchema, type ScoreToolName } from "./tool-definitions";

const PREVIEW_LIMIT = 128;
const UNSUPPORTED_NOTATION = [
  "polyphony",
  "tuplets",
  "ties/slurs",
  "hairpins",
  "nested repeats",
  "alternate endings",
  "arbitrary executable notation",
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

  const handlers: Record<ScoreToolName, ToolHandler> = {
    score_get_context(raw) {
      const { selectedIds } = readContextSchema.parse(raw);
      const { score } = getSession();
      const valid = anchorIds(score.measures);
      if (selectedIds.some((id) => !valid.has(id))) throw new Error("Selection contains a missing target.");
      return {
        ok: true,
        score: structuredClone(score),
        selectedIds,
        durationUnit: "quarter-note beats",
        unsupported: UNSUPPORTED_NOTATION,
      };
    },

    score_preview(raw) {
      const command = commandSchema.parse(raw);
      const before = getSession().score;
      const proposed = applyCommand(before, command);
      const previewId = command.requestId;
      rememberPreview(previewId, command);
      const changedMeasureIds = proposed.measures
        .filter((m) => JSON.stringify(m) !== JSON.stringify(before.measures.find((b) => b.id === m.id)))
        .map((m) => m.id);
      const removedMeasureIds = before.measures
        .filter((m) => !proposed.measures.some((n) => n.id === m.id))
        .map((m) => m.id);
      return { ok: true, previewId, expectedRevision: before.revision, proposed, changedMeasureIds, removedMeasureIds };
    },

    score_apply(raw) {
      const { previewId, expectedRevision } = applyPreviewSchema.parse(raw);
      const preview = previews.get(previewId);
      if (!preview) throw new Error("Preview not found. Preview the operation first.");
      if (expectedRevision !== preview.command.expectedRevision) throw new Error("Preview revision does not match.");
      const session = getSession();
      if (preview.applied) return { ok: true, duplicate: true, revision: session.score.revision };
      const next = execute(session, preview.command);
      setSession(next);
      preview.applied = true;
      return { ok: true, revision: next.score.revision, score: structuredClone(next.score) };
    },

    score_undo(raw) {
      const { expectedRevision } = undoSchema.parse(raw);
      const session = getSession();
      if (expectedRevision !== session.score.revision) {
        throw new Error("The score changed. Read the latest revision before undo.");
      }
      const next = travel(session, "undo");
      setSession(next);
      return { ok: true, revision: next.score.revision, changed: next !== session };
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
      const message =
        error instanceof z.ZodError
          ? "Invalid tool arguments."
          : error instanceof Error
            ? error.message
            : "Score operation failed.";
      return { ok: false, error: message };
    }
  };
}
