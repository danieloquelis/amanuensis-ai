import { applyCommand } from "../domain/operations/apply-command";
import type { Command } from "../domain/operations/schema";
import type { Score } from "../domain/schema";

const UNDO_LIMIT = 100;

/** Local editing session: current score, undo/redo stacks and idempotency receipts. */
export type Session = {
  score: Score;
  past: Score[];
  future: Score[];
  /** Request ID → serialized command, so retries are harmless and reuse is detected. */
  requests: Record<string, string>;
};

export const createSession = (score: Score): Session => ({ score, past: [], future: [], requests: {} });

/** Applies a command once. Retrying the same request returns the session unchanged. */
export function execute(session: Session, command: Command): Session {
  const payload = JSON.stringify(command);
  if (Object.hasOwn(session.requests, command.requestId)) {
    if (session.requests[command.requestId] !== payload) {
      throw new Error("A request ID cannot be reused for a different edit.");
    }
    return session;
  }
  const score = applyCommand(session.score, command);
  return {
    score,
    past: [...session.past.slice(-(UNDO_LIMIT - 1)), session.score],
    future: [],
    requests: { ...session.requests, [command.requestId]: payload },
  };
}

/**
 * Restores the previous or next snapshot as a new revision. Snapshots are safe for a single
 * local writer; a server or multi-writer session will need field-level compensation instead.
 */
export function travel(session: Session, direction: "undo" | "redo"): Session {
  const source = direction === "undo" ? session.past : session.future;
  if (!source.length) return session;
  const score = { ...source[source.length - 1], revision: session.score.revision + 1 };
  const remaining = source.slice(0, -1);
  return direction === "undo"
    ? { ...session, score, past: remaining, future: [...session.future, session.score] }
    : { ...session, score, future: remaining, past: [...session.past, session.score] };
}
