import { restoreTurns, turnsToSave, type WorkspaceChats } from "../application/chat-history";

/** The pre-workspace conversation, adopted once with the legacy draft. */
const LEGACY_KEY = "amanuensis.chat.v1";
const chatKey = (id: string) => `amanuensis.chat.${id}`;

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
  },
};
