import { useEffect, useRef, useState } from "react";
import type { Command, Score } from "@/modules/score";
import { takeParts, type TakePart } from "@/modules/voice";
import type { ChatRepository, Turn } from "../../application/chat-history";
import type { HeardTake } from "../../application/handle-voice-request";
import type { AssistantResult, AssistantTurn, ProgressListener } from "../../application/run-assistant";
import { requestAssistant, requestVoiceAssistant, type AssistantPayload } from "../../infrastructure/assistant-client";

const HISTORY_TURNS = 6;
const VOICE_LABEL = "Voice take";

type Request = (
  payload: AssistantPayload,
  onProgress: ProgressListener,
) => Promise<AssistantResult & { heard?: HeardTake }>;

/** What a turn sent, kept for this session so a failed turn can be sent again as it was. */
type Attempt = { instruction: string; request: Request; context: RequestContext };

/** What a request is about: the picked IDs and their name. Empty IDs mean the whole score. */
export type RequestContext = { ids: string[]; name: string | null };
export type Assistant = ReturnType<typeof useAssistant>;

export type { Turn };

type Options = {
  getScore: () => Score;
  applyCommands: (commands: Command[], receipt: string) => boolean;
  /** Where the conversation is kept, so it survives a reload. */
  chats: ChatRepository;
};

/** How long a sung stretch is, as the history shows it. */
export const sungLength = (seconds: number) => `${Math.max(1, Math.round(seconds))} s`;

/** A take as text, in order: their words, and "♪ sang 3 s" where they sang (for history). */
export function describeHeard(parts: TakePart[]): string {
  const text = parts.map((part) => (part.kind === "said" ? part.text : `♪ sang ${sungLength(part.seconds)}`));
  return text.join(" ") || "(nothing heard)";
}

const heardOf = ({ speech, sung }: HeardTake) => takeParts(speech, sung);

/**
 * One conversation with the score AI, driven from the compose bar. Each instruction (typed
 * or a recorded take) is sent with the current score and what it is about; returned commands
 * are applied as one undoable step. The conversation is saved whenever no turn is running.
 */
export function useAssistant({ getScore, applyCommands, chats }: Options) {
  const [turns, setTurns] = useState<Turn[]>([]);
  // Nothing is saved until the earlier conversation has been read, so it is never overwritten.
  const [restored, setRestored] = useState(false);
  // Holds a take's audio too, so retrying never asks the musician to sing again.
  const attempts = useRef(new Map<string, Attempt>());
  const busy = turns.some((turn) => turn.status === "working");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setTurns(chats.load());
      } catch {
        // An unreadable conversation starts empty; the song itself is unaffected.
      }
      setRestored(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [chats]);

  useEffect(() => {
    if (!restored || busy) return;
    try {
      chats.save(turns);
    } catch {
      // Storage full or blocked: the chat still works, it just won't survive a reload.
    }
  }, [busy, chats, restored, turns]);

  const update = (id: string, patch: Partial<Turn>) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  /**
   * Sends a request as a new turn, or again in place of a failed one (`retryId`). `label` is
   * shown until the server says what it heard; `instruction` is what it is sent.
   */
  const run = async (label: string, { instruction, request, context }: Attempt, spoken: boolean, retryId?: string) => {
    const id = retryId ?? crypto.randomUUID();
    attempts.current.set(id, { instruction, request, context });
    const history: AssistantTurn[] = turns
      .filter((turn) => turn.status === "done" && turn.reply)
      .slice(-HISTORY_TURNS)
      .map((turn) => ({
        instruction: turn.context ? `[${turn.context}] ${turn.instruction}` : turn.instruction,
        reply: turn.reply!,
      }));
    const about = { context: context.name ?? undefined };
    if (retryId) update(id, { status: "working", reply: undefined, question: undefined, changes: undefined });
    else setTurns((all) => [...all, { id, instruction: label, status: "working", spoken, ...about }]);
    const selection = { selectedIds: context.ids, ...(context.name ? { selectionName: context.name } : {}) };
    try {
      const result = await request({ instruction, score: getScore(), ...selection, history }, (activity) =>
        // What was heard replaces "Voice take" as soon as it is known, before the agent answers.
        update(
          id,
          activity.stage === "heard"
            ? { activity, heard: activity.parts, instruction: describeHeard(activity.parts) }
            : { activity },
        ),
      );
      const parts = result.heard && heardOf(result.heard);
      const heard = parts ? { heard: parts, instruction: describeHeard(parts) } : {};
      if (result.commands.length && !applyCommands(result.commands, result.reply)) {
        update(id, { ...heard, status: "failed", reply: "The score changed while I was working. Try again." });
        return;
      }
      attempts.current.delete(id);
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

  /** Sends a typed instruction; resolves once it is answered. Ignored while another is running. */
  const send = async (instruction: string, context: RequestContext) => {
    const text = instruction.trim();
    if (text && !busy) await run(text, { instruction: text, request: requestAssistant, context }, false);
  };

  const sendTake = async (wav: Uint8Array, context: RequestContext) => {
    if (busy) return;
    const request: Request = (payload, progress) => requestVoiceAssistant(wav, payload, progress);
    await run(VOICE_LABEL, { instruction: "", request, context }, true);
  };

  /** Whether a failed turn can be sent again: only in the session that sent it. */
  const canRetry = (turn: Turn) => turn.status === "failed" && attempts.current.has(turn.id);

  /** Sends a failed turn again, as it was, against the current score. */
  const retry = async (turnId: string) => {
    const attempt = attempts.current.get(turnId);
    const turn = turns.find((t) => t.id === turnId);
    if (!attempt || !turn || busy) return;
    await run(turn.instruction, attempt, turn.spoken ?? false, turnId);
  };

  /** Forgets the whole conversation, e.g. for a new song. A reply still on its way is dropped. */
  const clear = () => {
    attempts.current.clear();
    setTurns([]);
  };

  return { turns, busy, send, sendTake, canRetry, retry, clear };
}
