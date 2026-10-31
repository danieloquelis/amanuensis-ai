import { restoreTurns, turnsToSave, type ChatRepository } from "../application/chat-history";

const STORAGE_KEY = "amanuensis.chat.v1";
const chatKey = (id: string) => `amanuensis.chat.${id}`;

const repositoryFor = (key: string): ChatRepository => ({
  load() {
    const raw = localStorage.getItem(key);
    return raw ? restoreTurns(JSON.parse(raw)) : [];
  },
  save(turns) {
    localStorage.setItem(key, JSON.stringify(turnsToSave(turns)));
  },
});

/** The conversation with the current song, in this browser's localStorage. */
export const localChatRepository: ChatRepository = repositoryFor(STORAGE_KEY);

/** The conversation with one workspace. */
export const chatRepositoryFor = (id: string): ChatRepository => repositoryFor(chatKey(id));

/** Moves the pre-workspace chat to the adopted workspace; later calls do nothing. */
export function adoptLegacyChat(id: string): void {
  if (localStorage.getItem(chatKey(id)) !== null) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  localStorage.setItem(chatKey(id), raw);
  localStorage.removeItem(STORAGE_KEY);
}

/** Forgets one workspace's conversation. */
export function removeWorkspaceChat(id: string): void {
  localStorage.removeItem(chatKey(id));
}
