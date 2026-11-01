import { useCallback, useEffect, useState } from "react";
import type { ChatRepository } from "../../application/chat-history";
import { localMusicianMemory } from "../../infrastructure/local-chat";

/** Reads storage that may be blocked or unreadable; the fallback when it is. */
function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/**
 * What the assistant keeps beyond the chat: this song's notes and what it has learned about the
 * musician (across songs). Sent with every request; kept when a turn changes them; shown to the
 * musician, who can drop any of it.
 */
export function useAgentMemory(chats: ChatRepository) {
  const [songNotes, setSongNotes] = useState("");
  const [facts, setFacts] = useState<string[]>([]);
  // Read after mount, so the server and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSongNotes(safely(() => chats.loadNotes(), ""));
      setFacts(safely(() => localMusicianMemory.load(), []));
    });
    return () => cancelAnimationFrame(frame);
  }, [chats]);

  const keepNotes = useCallback(
    (text: string) => {
      setSongNotes(text);
      safely(() => chats.saveNotes(text), undefined);
    },
    [chats],
  );
  const keepFacts = useCallback((next: string[]) => {
    setFacts(next);
    safely(() => localMusicianMemory.save(next), undefined);
  }, []);

  return {
    songNotes,
    facts,
    /** Keeps what a finished turn changed. */
    keep: (result: { songNotes?: string; memory?: string[] }) => {
      if (result.songNotes !== undefined) keepNotes(result.songNotes);
      if (result.memory) keepFacts(result.memory);
    },
    forget: (fact: string) => keepFacts(facts.filter((known) => known !== fact)),
    clearNotes: () => keepNotes(""),
  };
}
