import { useState } from "react";
import type { Command, Score } from "@/modules/score";
import type { AssistantTurn } from "../../application/run-assistant";
import { requestAssistant } from "../../infrastructure/assistant-client";

const HISTORY_TURNS = 6;

export type Turn = {
  id: string;
  instruction: string;
  status: "working" | "done" | "failed";
  reply?: string;
  question?: { text: string; choices: string[] };
  changes?: string[];
  /** Score revision right after this turn's edits; Undo is offered while it is still current. */
  revision?: number;
};

type Options = {
  getScore: () => Score;
  selectedIds: string[];
  applyCommands: (commands: Command[], receipt: string) => boolean;
};

/**
 * One conversation with the score assistant. Each instruction is sent with the current score
 * and selection; returned commands are applied as one undoable step.
 */
export function useAssistant({ getScore, selectedIds, applyCommands }: Options) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const busy = turns.some((turn) => turn.status === "working");
  const update = (id: string, patch: Partial<Turn>) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  const send = async (instruction: string) => {
    const text = instruction.trim();
    if (!text || busy) return;
    const id = crypto.randomUUID();
    const history: AssistantTurn[] = turns
      .filter((turn) => turn.status === "done" && turn.reply)
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ instruction: turn.instruction, reply: turn.reply! }));
    setTurns((all) => [...all, { id, instruction: text, status: "working" }]);
    try {
      const result = await requestAssistant({ instruction: text, score: getScore(), selectedIds, history });
      if (result.commands.length && !applyCommands(result.commands, result.reply)) {
        update(id, { status: "failed", reply: "The score changed while I was working. Ask again." });
        return;
      }
      update(id, {
        status: "done",
        reply: result.reply,
        question: result.question ?? undefined,
        changes: result.changes,
        revision: result.commands.length ? getScore().revision : undefined,
      });
    } catch (error) {
      update(id, { status: "failed", reply: error instanceof Error ? error.message : "Something went wrong." });
    }
  };

  return { turns, busy, send };
}
