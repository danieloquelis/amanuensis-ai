import { useState } from "react";
import type { Command, Score } from "@/modules/score";
import type { HeardTake } from "../../application/handle-voice-request";
import type { AssistantResult, AssistantTurn, ProgressEvent, ProgressListener } from "../../application/run-assistant";
import { requestAssistant, requestVoiceAssistant, type AssistantPayload } from "../../infrastructure/assistant-client";

const HISTORY_TURNS = 6;
const VOICE_LABEL = "Voice take";

type Request = (
  payload: AssistantPayload,
  onProgress: ProgressListener,
) => Promise<AssistantResult & { heard?: HeardTake }>;

export type Turn = {
  id: string;
  instruction: string;
  status: "working" | "done" | "failed";
  reply?: string;
  question?: { text: string; choices: string[] };
  changes?: string[];
  /** Score revision right after this turn's edits; Undo is offered while it is still current. */
  revision?: number;
  /** What the assistant is doing right now, while the turn is working. */
  activity?: ProgressEvent;
  /** Whether the turn came from a recorded take. */
  spoken?: boolean;
};

type Options = {
  getScore: () => Score;
  selectedIds: string[];
  applyCommands: (commands: Command[], receipt: string) => boolean;
};

/** A take as the musician would describe it: what they said, and that they sang. */
export function describeHeard({ speech, sung }: HeardTake): string {
  const said = speech.map((turn) => turn.text).join(" ");
  const sang = sung.length ? `♪ sang ${Math.round(sung.reduce((sum, s) => sum + s.end - s.start, 0))} s` : "";
  return [said && `“${said}”`, sang].filter(Boolean).join(" · ") || "(nothing heard)";
}

/**
 * One conversation with the score assistant. Each instruction (typed or a recorded take) is sent
 * with the current score and selection; returned commands are applied as one undoable step.
 */
export function useAssistant({ getScore, selectedIds, applyCommands }: Options) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const busy = turns.some((turn) => turn.status === "working");
  const update = (id: string, patch: Partial<Turn>) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  /** `label` is shown until the server says what it heard; `instruction` is what it is sent. */
  const run = async (label: string, instruction: string, request: Request, spoken = false) => {
    const id = crypto.randomUUID();
    const history: AssistantTurn[] = turns
      .filter((turn) => turn.status === "done" && turn.reply)
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ instruction: turn.instruction, reply: turn.reply! }));
    setTurns((all) => [...all, { id, instruction: label, status: "working", spoken }]);
    try {
      const result = await request({ instruction, score: getScore(), selectedIds, history }, (activity) =>
        update(id, { activity }),
      );
      const heard = result.heard ? { instruction: describeHeard(result.heard) } : {};
      if (result.commands.length && !applyCommands(result.commands, result.reply)) {
        update(id, { ...heard, status: "failed", reply: "The score changed while I was working. Ask again." });
        return;
      }
      update(id, {
        ...heard,
        status: "done",
        activity: undefined,
        reply: result.reply,
        question: result.question ?? undefined,
        changes: result.changes,
        revision: result.commands.length ? getScore().revision : undefined,
      });
    } catch (error) {
      update(id, {
        status: "failed",
        activity: undefined,
        reply: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  };

  const send = async (instruction: string) => {
    const text = instruction.trim();
    if (text && !busy) await run(text, text, requestAssistant);
  };

  const sendTake = async (wav: Uint8Array) => {
    if (!busy)
      await run(VOICE_LABEL, "", (payload, onProgress) => requestVoiceAssistant(wav, payload, onProgress), true);
  };

  return { turns, busy, send, sendTake };
}
