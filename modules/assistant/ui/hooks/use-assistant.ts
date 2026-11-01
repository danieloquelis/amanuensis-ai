import { useEffect, useRef, useState } from "react";
import type { Command, Score } from "@/modules/score";
import { askedAfter, withHeardWords, type AskedTake } from "../../application/asked-take";
import { useAssistantSettings } from "./use-assistant-settings";
import { attachmentKind } from "../../application/attachments";
import type { ChatRepository, Turn } from "../../application/chat-history";
import type { HeardTake } from "../../application/handle-voice-request";
import type { AssistantResult, ProgressListener } from "../../application/run-assistant";
import { describeHeard, heardOf, historyOf } from "../../application/turn-text";
import { STOPPED_RECEIPT, stoppedReply } from "../../application/stopped-turn";
import { withProgress } from "../../application/work-log";
import { requestAssistant, requestVoiceAssistant, type AssistantPayload } from "../../infrastructure/assistant-client";
import { useLiveTurn } from "./use-live-turn";

const VOICE_LABEL = "Voice take";

type Request = (
  payload: AssistantPayload,
  onProgress: ProgressListener,
  signal: AbortSignal,
) => Promise<AssistantResult & { heard?: HeardTake }>;

/** What a turn sent, kept for this session so a failed turn can be sent again as it was. */
type Attempt = { instruction: string; request: Request; context: RequestContext };

/** What a request is about: the picked IDs and their name. Empty IDs mean the whole score. */
export type RequestContext = { ids: string[]; name: string | null };
export type Assistant = ReturnType<typeof useAssistant>;

export type { Turn };
export { describeHeard, sungLength } from "../../application/turn-text";

type Options = {
  getScore: () => Score;
  applyCommands: (commands: Command[], receipt: string) => boolean;
  /** Where the conversation is kept, so it survives a reload. */
  chats: ChatRepository;
};

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
  // The last take, which typed words go with: an answer about it, or a follow-up once written.
  const asked = useRef<AskedTake | null>(null);
  const busy = turns.some((turn) => turn.status === "working");
  const live = useLiveTurn();
  const { thinking, memory, band, request: settings } = useAssistantSettings(chats);

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
  const run = async (
    label: string,
    { instruction, request, context }: Attempt,
    spoken: boolean,
    retryId?: string,
    attachments?: Turn["attachments"],
  ): Promise<(AssistantResult & { heard?: HeardTake }) | null> => {
    const id = retryId ?? crypto.randomUUID();
    attempts.current.set(id, { instruction, request, context });
    const history = historyOf(turns);
    const about = { context: context.name ?? undefined };
    if (retryId) {
      update(id, { status: "working", reply: undefined, question: undefined, changes: undefined, seconds: undefined });
    } else setTurns((all) => [...all, { id, instruction: label, status: "working", spoken, attachments, ...about }]);
    const selection = { selectedIds: context.ids, ...(context.name ? { selectionName: context.name } : {}) };
    const started = Date.now();
    const took = () => ({ seconds: (Date.now() - started) / 1000 });
    const signal = live.begin();
    try {
      const payload = {
        instruction,
        score: getScore(),
        ...selection,
        history,
        ...settings(),
      };
      const result = await request(
        payload,
        (activity) => {
          // Edits go to the sheet as they are made; the turn's line shows what it is doing.
          if (activity.stage === "edits") return live.apply(activity);
          if (activity.stage === "draft") return live.write(activity);
          // What was heard replaces "Voice take" as soon as it is known, before the agent answers.
          const heard =
            activity.stage === "heard" && spoken
              ? { heard: activity.parts, instruction: describeHeard(activity.parts) }
              : {};
          // Its thinking, steps and plan are kept with the turn as they stream in.
          setTurns((all) =>
            all.map((turn) =>
              turn.id === id ? { ...turn, ...heard, ...withProgress(turn, activity), activity } : turn,
            ),
          );
        },
        signal,
      );
      // A typed answer sent with an earlier take keeps its own words.
      const parts = spoken && result.heard && heardOf(result.heard);
      const heard = parts ? { heard: parts, instruction: describeHeard(parts) } : {};
      if (result.commands.length && !applyCommands(result.commands, result.reply)) {
        update(id, {
          ...heard,
          ...took(),
          status: "failed",
          reply: "The score changed while I was working. Try again.",
        });
        return null;
      }
      attempts.current.delete(id);
      memory.keep(result);
      update(id, {
        ...heard,
        ...took(),
        ...(result.plan ? { plan: result.plan } : {}),
        status: "done",
        activity: undefined,
        reply: result.reply,
        question: result.question ?? undefined,
        changes: result.changes,
        revision: result.commands.length ? getScore().revision : undefined,
      });
      return result;
    } catch (error) {
      if (signal.aborted) {
        // Stopped: what the sheet already shows is kept, as one undo step.
        const written = live.latest.current;
        const kept = written.length > 0 && applyCommands(written, STOPPED_RECEIPT);
        attempts.current.delete(id);
        const revision = kept ? getScore().revision : undefined;
        update(id, {
          ...took(),
          status: "done",
          activity: undefined,
          reply: stoppedReply(written.length, kept),
          revision,
        });
        return null;
      }
      update(id, {
        ...took(),
        status: "failed",
        activity: undefined,
        reply: error instanceof Error ? error.message : "Something went wrong.",
      });
      return null;
    } finally {
      // The committed score now holds the turn (or it failed): the sheet stops showing a preview.
      live.end();
    }
  };

  /**
   * Sends a typed instruction, with any attached files; resolves once it is answered. Ignored
   * while another is running.
   */
  const send = async (instruction: string, context: RequestContext, files: File[] = []) => {
    const text = instruction.trim();
    if ((!text && !files.length) || busy) return;
    const take = files.length ? null : asked.current;
    // An answer to a question about a take: the agent hears the take again, not just the answer.
    const request: Request = take
      ? (payload, progress, signal) => requestVoiceAssistant(take.wav, withHeardWords(payload, take), progress, signal)
      : (payload, progress, signal) => requestAssistant(payload, progress, files, signal);
    const attached = files.map((file) => ({ name: file.name, kind: attachmentKind(file.type, file.name) ?? "text" }));
    const result = await run(text, { instruction: text, request, context }, false, undefined, attached);
    // Attached files start something else: the take is left behind.
    asked.current = askedAfter(asked.current, take, result, files.length > 0);
  };

  const sendTake = async (wav: Uint8Array, context: RequestContext) => {
    if (busy) return;
    const request: Request = (payload, progress, signal) => requestVoiceAssistant(wav, payload, progress, signal);
    const result = await run(VOICE_LABEL, { instruction: "", request, context }, true);
    asked.current = askedAfter(asked.current, { wav, speech: result?.heard?.recognized }, result);
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
    asked.current = null;
    setTurns([]);
  };

  return {
    turns,
    busy,
    /** The earlier conversation has been read: a turn sent now is never overwritten by it. */
    ready: restored,
    live: live.commands,
    draft: live.draft,
    stop: live.stop,
    send,
    sendTake,
    canRetry,
    retry,
    clear,
    /** How long the model may think, as the musician chose it. */
    thinking,
    /** This song's notes and what the assistant has learned about the musician. */
    memory,
    /** Band Mode: on or off, and the musician's band. */
    band,
  };
}
