import { describeTake } from "@/modules/voice";
import { attachmentParts } from "./attachments";
import type { ChatMessage } from "./model-port";
import type { AssistantRequest } from "./run-assistant";
import type { createScoreToolGateway } from "./score-tool-gateway";

// The messages a turn opens with: earlier turns, then the musician's request with the score.

export function historyMessages(request: AssistantRequest): ChatMessage[] {
  return request.history.flatMap((turn): ChatMessage[] => [
    { role: "user", content: turn.instruction },
    { role: "assistant", content: turn.reply, toolCalls: [] },
  ]);
}

/** A take's words are the request itself: the agent is told so, not left to infer it. */
const TAKE_INTRO = "The musician recorded this take. What they said is their request; carry it out.";
/** Typed with a take, the words answer the agent's question about that take, asked last turn. */
const ANSWER_INTRO =
  "That is their reply to your question about the take below, recorded last turn: carry out what the take asks, with that answer. Its singing is all here.";

/** Typed after a take was written: the take is here again, for words about its singing. */
const FOLLOW_UP_INTRO =
  "The take below was recorded last turn and you wrote it (see your last reply); its singing is all here again. If their words are about that singing (try again, other bars, keep the rhythm or the notes, another line), hear it again with the voice tools. Otherwise leave what was written and do just what they ask.";

/** Files sent without words are the request themselves. */
const ATTACHED_INTRO = "The musician attached music without saying anything else: read it into the score.";

export function userMessage(request: AssistantRequest, context: string): ChatMessage {
  const intro = !request.instruction.trim() ? TAKE_INTRO : request.takeWritten ? FOLLOW_UP_INTRO : ANSWER_INTRO;
  const take = request.take ? `\n\n${intro}\n${describeTake(request.take)}` : "";
  const text = `${request.instruction}${take}\n\n${context}`.trim();
  const attachments = request.attachments ?? [];
  if (!attachments.length) return { role: "user", content: text };
  const words = request.instruction.trim() ? text : `${ATTACHED_INTRO}\n\n${text}`;
  return { role: "user", content: [{ type: "text", text: words }, ...attachmentParts(attachments)] };
}

/**
 * The score as score_get_context returns it, sent with the request so the agent can act in its
 * first step instead of spending a model round trip reading the score.
 */
export function scoreContext(tools: ReturnType<typeof createScoreToolGateway>, request: AssistantRequest): string {
  const result = tools("score_get_context", { selectedIds: request.selectedIds });
  if (!result.ok) return "";
  const { score, selected, vocabulary, notYetSupported } = result as Record<string, unknown>;
  const name = request.selectionName ? `${request.selectionName}: ` : "";
  const picked = (selected as string[]).length ? `\n[Selected: ${name}${(selected as string[]).join(", ")}]` : "";
  return [
    `[Score context, as score_get_context returns it]\n${score}${picked}`,
    `[Vocabulary] ${JSON.stringify(vocabulary)}`,
    `[Not yet supported] ${(notYetSupported as string[]).join("; ")}`,
  ].join("\n");
}
