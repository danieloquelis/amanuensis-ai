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
  /** The selection the request was about ("Bars 3–6"), shown with it in the chat. */
  context?: string;
  /** Where it was asked: in the chat panel or from the selection on the sheet. */
  origin: TurnOrigin;
};

export type TurnOrigin = "chat" | "canvas";
/** What a request is about: the picked IDs and their name. Empty IDs mean the whole score. */
export type RequestContext = { ids: string[]; name: string | null; origin: TurnOrigin };
export type Assistant = ReturnType<typeof useAssistant>;

type Options = {
  getScore: () => Score;
  applyCommands: (commands: Command[], receipt: string) => boolean;
};

/** A take as the musician would describe it: their words as they said them, and that they sang. */
export function describeHeard(said: string, sungSeconds: number): string {
  const sang = sungSeconds ? `♪ sang ${Math.max(1, Math.round(sungSeconds))} s` : "";
  return [said.trim(), sang].filter(Boolean).join(" · ") || "(nothing heard)";
}

const heardLabel = ({ speech, sung }: HeardTake) =>
  describeHeard(
    speech.map((turn) => turn.text).join(" "),
    sung.reduce((sum, span) => sum + span.end - span.start, 0),
  );

/**
 * One conversation with the score assistant, shared by the chat panel and the composer on the
 * sheet. Each instruction (typed or a recorded take) is sent with the current score and what it
 * is about; returned commands are applied as one undoable step.
 */
export function useAssistant({ getScore, applyCommands }: Options) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const busy = turns.some((turn) => turn.status === "working");
  const update = (id: string, patch: Partial<Turn>) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  /** `label` is shown until the server says what it heard; `instruction` is what it is sent. */
  const run = async (label: string, instruction: string, request: Request, context: RequestContext, spoken = false) => {
    const id = crypto.randomUUID();
    const history: AssistantTurn[] = turns
      .filter((turn) => turn.status === "done" && turn.reply)
      .slice(-HISTORY_TURNS)
      .map((turn) => ({
        instruction: turn.context ? `[${turn.context}] ${turn.instruction}` : turn.instruction,
        reply: turn.reply!,
      }));
    const about = { context: context.name ?? undefined, origin: context.origin };
    setTurns((all) => [...all, { id, instruction: label, status: "working", spoken, ...about }]);
    const selection = { selectedIds: context.ids, ...(context.name ? { selectionName: context.name } : {}) };
    try {
      const result = await request({ instruction, score: getScore(), ...selection, history }, (activity) =>
        // What was heard replaces "Voice take" as soon as it is known, before the agent answers.
        update(
          id,
          activity.stage === "heard"
            ? { activity, instruction: describeHeard(activity.said, activity.sungSeconds) }
            : { activity },
        ),
      );
      const heard = result.heard ? { instruction: heardLabel(result.heard) } : {};
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

  const send = async (instruction: string, context: RequestContext) => {
    const text = instruction.trim();
    if (text && !busy) await run(text, text, requestAssistant, context);
  };

  const sendTake = async (wav: Uint8Array, context: RequestContext) => {
    if (busy) return;
    await run(VOICE_LABEL, "", (payload, progress) => requestVoiceAssistant(wav, payload, progress), context, true);
  };

  return { turns, busy, send, sendTake };
}
