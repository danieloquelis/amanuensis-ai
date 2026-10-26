import { useState } from "react";
import type { Operation, Score } from "@/modules/score";
import { checkOperation } from "../../application/operation-check";
import type { CommitEdit } from "./use-score-editor";

export type PendingChange = { operation: Operation; revision: number; description: string };

/**
 * Preview-then-apply flow for broad or destructive edits. A proposal is validated first and
 * bound to the revision it was made against; it cannot be applied after the score changes.
 */
export function usePendingChange(score: Score, onCommand: CommitEdit, onError: (message: string) => void) {
  const [pending, setPending] = useState<PendingChange | null>(null);

  const propose = (operation: Operation, description: string) => {
    const problem = checkOperation(score, operation);
    if (problem) {
      setPending(null);
      onError(problem);
      return;
    }
    setPending({ operation, revision: score.revision, description });
  };

  const apply = () => {
    if (!pending) return;
    onCommand(pending.operation, pending.description, pending.revision);
    setPending(null);
  };

  return {
    pending,
    isStale: pending !== null && pending.revision !== score.revision,
    propose,
    apply,
    discard: () => setPending(null),
  };
}
