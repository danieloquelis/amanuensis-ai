import { useLayoutEffect, useRef, useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import type { StartRequest } from "../../application/start-request";
import { useAttachments } from "../hooks/use-attachments";
import { useThinking } from "../hooks/use-thinking";
import { Composer } from "./Composer";
import { ThinkingMenu } from "./ThinkingMenu";
import styles from "./assistant.module.css";

/** Ideas for a first request, sent as they are. */
const STARTERS = ["A waltz in D minor for piano", "Chords C, Am, F, G in 4/4, one per bar", "A slow blues for trumpet"];

/**
 * The compose bar before a song exists (Home): the same bar as in the editor, with no selection
 * to name. Whatever is sent, typed or sung, becomes the first request of a new song (`onStart`).
 */
export function StartComposer({ onStart }: { onStart: (request: StartRequest) => void }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  // Sent once: the song opens next, so nothing more can be sent from here.
  const [started, setStarted] = useState(false);
  // Next keeps Home alive (hidden) while the song is open: when Home hides, the bar is ready again
  // for the next visit, rather than still showing the request it sent.
  useLayoutEffect(() => () => setStarted(false), []);
  const attachments = useAttachments();
  // Chosen here, kept in this browser: the new song's first turn runs at this level.
  const thinking = useThinking();
  const start = (request: StartRequest) => {
    if (started) return;
    setStarted(true);
    onStart(request);
  };
  return (
    <div className={styles.start}>
      <Composer
        busy={started}
        placeholder="Sing, hum, or describe a song…"
        inputRef={inputRef}
        draft={draft}
        onDraft={setDraft}
        attachments={attachments}
        onSend={(text, files) => start({ kind: "text", text, files })}
        onTake={(wav) => start({ kind: "take", wav })}
        onStop={() => undefined}
        accessory={<ThinkingMenu level={thinking.level} onChange={thinking.choose} />}
      />
      <div className={styles.suggestions} data-visible="true" role="group" aria-label="Ideas">
        {STARTERS.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={started}
            onClick={() => start({ kind: "text", text: idea, files: [] })}
          >
            <Sparkle size={13} weight="fill" />
            {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
