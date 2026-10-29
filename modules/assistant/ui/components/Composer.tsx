import { ArrowUp, Paperclip } from "@phosphor-icons/react";
import type { ReactNode, RefObject } from "react";
import { useVoiceRecorder } from "@/modules/voice/ui";
import { IconButton } from "@/shared/ui/IconButton";
import { AiOrb } from "./AiOrb";
import styles from "./assistant.module.css";

type ComposerProps = {
  busy: boolean;
  /** What a request is about: the selection's name, or the whole score. */
  subject: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** The text typed so far; held by the caller so it survives the bar moving to the sidebar. */
  draft: string;
  onDraft: (text: string) => void;
  onSend: (text: string) => void;
  onTake: (wav: Uint8Array) => void;
  /** Controls before the send button (the chat toggle). */
  accessory?: ReactNode;
};

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
/**
 * Relative heights of the waveform's bars, scaled by the live input level: uneven on purpose, so
 * it reads as a voice rather than a meter, and tallest in the middle.
 */
const WAVE_SHAPE = [
  0.3, 0.45, 0.6, 0.5, 0.8, 0.95, 0.7, 0.9, 1.1, 0.85, 1.2, 1, 1.15, 0.9, 1.05, 0.8, 0.95, 0.65, 0.8, 0.55, 0.65, 0.45,
  0.35, 0.25,
];

/**
 * The compose bar: tap the orb and sing, hum or talk (tap again to stop), or type and press
 * Enter. What a request is about (the selection, or the whole score) shows as a chip before the
 * text. While a take is recorded or read, the bar draws in to a compact pill around the orb, a
 * live waveform and the time, and opens out again after.
 */
export function Composer({ busy, subject, inputRef, draft, onDraft, onSend, onTake, accessory }: ComposerProps) {
  const recorder = useVoiceRecorder(onTake);
  const recording = recorder.status === "recording";
  const preparing = recorder.status === "processing";
  const capturing = recording || preparing;
  const state = recording ? "listening" : busy || preparing ? "working" : "idle";
  const send = () => {
    if (!draft.trim() || busy) return;
    onSend(draft);
    onDraft("");
  };

  return (
    <div className={styles.barWrap} data-capturing={capturing}>
      <span className={styles.glow} data-state={state} aria-hidden />
      <form
        className={styles.bar}
        data-state={state}
        aria-label="Compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <AiOrb
          state={state}
          disabled={busy || preparing}
          onClick={() => (recording ? recorder.stop() : void recorder.start())}
        />
        {capturing ? (
          <CaptureStatus recording={recording} level={recorder.level} seconds={recorder.seconds} />
        ) : (
          <div className={styles.field}>
            <span key={subject} className={styles.subject}>
              {subject}
            </span>
            <textarea
              ref={inputRef}
              className={styles.input}
              aria-label="Describe the music"
              placeholder="Sing, hum, or describe a change…"
              value={draft}
              rows={1}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                send();
              }}
            />
          </div>
        )}
        {!capturing && (
          <>
            {/* Attaching an image or PDF of sheet music to transcribe is planned; the slot is here. */}
            <IconButton
              label="Attach an image or PDF"
              tooltip="Attach an image or PDF · coming soon"
              tooltipSide="top"
              aria-disabled="true"
              className={styles.attach}
            >
              <Paperclip size={20} />
            </IconButton>
            {accessory}
            <button className={styles.send} aria-label="Send" disabled={busy || !draft.trim()}>
              <ArrowUp size={18} weight="bold" />
            </button>
          </>
        )}
      </form>
      {recorder.error && (
        <p className={styles.recorderError} role="alert">
          {recorder.error}
        </p>
      )}
    </div>
  );
}

/** The compact pill's content: a live waveform and the time, or a note that the take is being read. */
function CaptureStatus({ recording, level, seconds }: { recording: boolean; level: number; seconds: number }) {
  return (
    <div
      className={styles.capture}
      role="status"
      aria-label={recording ? `Listening, ${formatSeconds(seconds)}` : "Reading your take"}
    >
      <span className={styles.wave} data-active={recording} aria-hidden>
        {WAVE_SHAPE.map((share, i) => (
          <i key={i} style={{ transform: `scaleY(${0.12 + 0.88 * Math.min(1, (recording ? level : 0.3) * share)})` }} />
        ))}
      </span>
      <span className={styles.captureText}>{recording ? formatSeconds(seconds) : "Reading…"}</span>
    </div>
  );
}
