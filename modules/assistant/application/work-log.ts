import type { PlanStep } from "./agent-state";
import type { ProgressEvent } from "./run-assistant";

/** What a turn did, in order: its thinking (the model's reasoning summary) and the steps it took. */
export type WorkEntry = { kind: "thought"; text: string } | { kind: "step"; tool: string };

/** A turn's record of its work: the log, and its plan when it made one. */
export type TurnWork = { log?: WorkEntry[]; plan?: PlanStep[] };

/** The thinking a turn keeps (characters): enough to see why, not the whole stream. */
const KEPT_THOUGHT = 4000;

/**
 * A turn's work after one progress event: a piece of thinking joins the thought being written,
 * a tool starts a new step, a plan replaces the last one. Other events leave it as it was.
 */
export function withProgress(work: TurnWork, event: ProgressEvent): TurnWork {
  const log = work.log ?? [];
  if (event.stage === "plan") return { ...work, plan: event.steps };
  if (event.stage === "tool") return { ...work, log: [...log, { kind: "step", tool: event.tool }] };
  if (event.stage !== "thought") return work;
  const last = log.at(-1);
  if (last?.kind === "thought")
    return { ...work, log: [...log.slice(0, -1), { ...last, text: last.text + event.text }] };
  return { ...work, log: [...log, { kind: "thought", text: event.text }] };
}

/** The log as kept with the chat: blank thinking dropped, the thinking cut to what is worth keeping. */
export function logToKeep(log: WorkEntry[] = []): WorkEntry[] {
  let room = KEPT_THOUGHT;
  return log.flatMap((entry): WorkEntry[] => {
    if (entry.kind === "step") return [entry];
    const text = entry.text.trim().slice(0, Math.max(0, room));
    room -= text.length;
    return text ? [{ kind: "thought", text }] : [];
  });
}
