import { restoreTurns, turnsToSave, type MusicianMemory, type WorkspaceChats } from "../application/chat-history";

/** The pre-workspace conversation, adopted once with the legacy draft. */
const LEGACY_KEY = "amanuensis.chat.v1";
const chatKey = (id: string) => `amanuensis.chat.${id}`;
const notesKey = (id: string) => `amanuensis.notes.${id}`;

/** Every workspace's conversation, in this browser's localStorage. */
export const localWorkspaceChats: WorkspaceChats = {
  for(workspaceId) {
    const key = chatKey(workspaceId);
    return {
      load() {
        const raw = localStorage.getItem(key);
        return raw ? restoreTurns(JSON.parse(raw)) : [];
      },
      save(turns) {
        localStorage.setItem(key, JSON.stringify(turnsToSave(turns)));
      },
      loadNotes: () => localStorage.getItem(notesKey(workspaceId)) ?? "",
      saveNotes(text) {
        localStorage.setItem(notesKey(workspaceId), text);
      },
    };
  },

  adoptLegacy(workspaceId) {
    if (localStorage.getItem(chatKey(workspaceId)) !== null) return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    localStorage.setItem(chatKey(workspaceId), raw);
    localStorage.removeItem(LEGACY_KEY);
  },

  remove(workspaceId) {
    localStorage.removeItem(chatKey(workspaceId));
    localStorage.removeItem(notesKey(workspaceId));
  },
};

const MEMORY_KEY = "amanuensis.memory";

/** What the agent has learned about the musician, in this browser's localStorage. */
export const localMusicianMemory: MusicianMemory = {
  load() {
    const raw = localStorage.getItem(MEMORY_KEY);
    const facts: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(facts) ? facts.filter((fact): fact is string => typeof fact === "string") : [];
  },
  save(facts) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(facts));
  },
};
