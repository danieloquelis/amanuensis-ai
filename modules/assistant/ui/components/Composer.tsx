import { useState } from "react";
import { useVoiceRecorder } from "@/modules/voice/ui";
import { MicIcon, SendIcon, StopIcon } from "./icons";
import styles from "./assistant.module.css";

type ComposerProps = {
  busy: boolean;
  onSend: (text: string) => void;
  onTake: (wav: Uint8Array) => void;
  /** Accessible name of the text field; each composer has its own. */
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
/** Bars of the level meter: the middle ones rise first, like a voice meter. */
const LEVEL_SHAPE = [0.6, 0.85, 1.1, 0.85, 0.6];

/** Type and send, or tap the microphone to talk and sing; tap again to stop. */
export function Composer({
  busy,
  onSend,
  onTake,
  label = "Instruction for the assistant",
  placeholder = "Ask, or tap the mic to talk and sing",
  autoFocus = false,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const recorder = useVoiceRecorder(onTake);
  const recording = recorder.status === "recording";
  const preparing = recorder.status === "processing";
  const send = () => {
    if (!draft.trim() || busy) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <div className={styles.composerArea}>
      <form
        className={recording ? `${styles.composer} ${styles.recordingComposer}` : styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {recording || preparing ? (
          <div className={styles.listening} role="status">
            <span className={styles.levels} aria-hidden>
              {LEVEL_SHAPE.map((share, i) => (
                <i key={i} style={{ transform: `scaleY(${0.15 + 0.85 * Math.min(1, recorder.level * share)})` }} />
              ))}
            </span>
            {recording ? `Listening ${formatSeconds(recorder.seconds)}` : "Getting your take ready…"}
          </div>
        ) : (
          <textarea
            aria-label={label}
            placeholder={placeholder}
            autoFocus={autoFocus}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              send();
            }}
          />
        )}
        <button
          type="button"
          className={recording ? `${styles.iconButton} ${styles.stop}` : styles.iconButton}
          aria-label={recording ? "Stop recording" : "Record a take"}
          disabled={busy || preparing}
          onClick={() => (recording ? recorder.stop() : void recorder.start())}
        >
          {recording ? <StopIcon /> : <MicIcon />}
        </button>
        {!recording && !preparing && (
          <button className={`${styles.iconButton} ${styles.send}`} aria-label="Send" disabled={busy || !draft.trim()}>
            <SendIcon />
          </button>
        )}
      </form>
      {recorder.error && <p className={styles.recorderError}>{recorder.error}</p>}
    </div>
  );
}
