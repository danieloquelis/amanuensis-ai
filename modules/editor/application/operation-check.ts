import { applyCommand, type Operation, type Score } from "@/modules/score";

/**
 * Dry-runs an operation against the current revision without changing anything.
 * Returns the reason it would fail, or `null` when it can be applied.
 */
export function checkOperation(score: Score, operation: Operation): string | null {
  try {
    applyCommand(score, { requestId: "dry-run", expectedRevision: score.revision, operation });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Unable to apply this edit.";
  }
}
