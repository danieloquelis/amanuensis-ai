import { restoreTurns, turnsToSave, type ChatRepository } from "../application/chat-history";

const STORAGE_KEY = "amanuensis.chat.v1";

/** The conversation with the current song, in this browser's localStorage. */
export const localChatRepository: ChatRepository = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? restoreTurns(JSON.parse(raw)) : [];
  },
  save(turns) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(turnsToSave(turns)));
  },
};
