import type { ChatRepository } from "../../application/chat-history";
import { useAgentMemory } from "./use-agent-memory";
import { useBand } from "./use-band";
import { useThinking } from "./use-thinking";

/**
 * What the musician set for the assistant, beyond the conversation: how long it may think, what it
 * remembers (this song's notes, the musician), and Band Mode. `request` is what each request carries.
 */
export function useAssistantSettings(chats: ChatRepository) {
  const thinking = useThinking();
  const memory = useAgentMemory(chats);
  const band = useBand();
  return {
    thinking,
    memory,
    band,
    request: () => ({
      thinking: thinking.level,
      songNotes: memory.songNotes,
      memory: memory.facts,
      ...(band.on ? { band: { on: true } } : {}),
    }),
  };
}
