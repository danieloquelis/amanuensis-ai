import { ArrowUp, Paperclip, Stop, X } from "@phosphor-icons/react";
import { useRef, type ReactNode, type RefObject } from "react";
import { useVoiceRecorder } from "@/modules/voice/ui";
import { IconButton } from "@/shared/ui/IconButton";
import { ATTACHMENT_LIMITS } from "../../application/attachments";
import type { Attachments } from "../hooks/use-attachments";
import { AiOrb } from "./AiOrb";
import { AttachmentChips } from "./AttachmentChips";
import styles from "./assistant.module.css";

type ComposerProps = {
  busy: boolean;
  /** What a request is about: the selection's name, or the whole score. */
  subject: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** The text typed so far; held by the caller so it survives the bar moving to the sidebar. */
  draft: string;
  onDraft: (text: string) => void;
  /** Sends the words and the attached files (either may be empty, not both). */
  onSend: (text: string, files: File[]) => void;
  onTake: (wav: Uint8Array) => void;
  /** Files waiting to go with the next request; held by the caller, like the draft. */
  attachments: Attachments;
  /** Stops the turn that is running; what it wrote so far is kept. */
  onStop: () => void;
  /** Controls before the send button (the chat toggle). */
  accessory?: ReactNode;
};

/** What the file picker offers: pictures, PDFs and music written as text. */
const ACCEPTED_FILES = "image/*,application/pdf,text/plain,.txt,.abc,.tab,.md,.cho,.chordpro";

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
 * The compose bar: tap the orb and sing, hum or talk (tap again to send it, or ✕ or Escape to
 * throw it away), or type and press Enter. What a request is about (the selection, or the whole score) shows as a chip before the
 * text. Sheet music (a picture, a PDF or text) is attached with the paperclip, dropped on the bar
 * or pasted, and waits above it. While a take is recorded or read, the bar draws in to a compact
 * pill around the orb, a live waveform and the time, and opens out again after.
 */
export function Composer(props: ComposerProps) {
  const { busy, subject, inputRef, draft, onDraft, onSend, onTake, onStop, accessory, attachments } = props;
  const picker = useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder(onTake);
  const recording = recorder.status === "recording";
  const preparing = recorder.status === "processing";
  const capturing = recording || preparing;
  const state = recording ? "listening" : busy || preparing ? "working" : "idle";
  const ready = Boolean(draft.trim() || attachments.files.length);
  const send = () => {
    if (!ready || busy) return;
    onSend(
      draft,
      attachments.take().map((item) => item.file),
    );
    onDraft("");
  };

  return (
    <div className={styles.barWrap} data-capturing={capturing}>
      {!capturing && <AttachmentChips files={attachments.files} onRemove={attachments.remove} />}
      <span className={styles.glow} data-state={state} aria-hidden />
      <form
        className={styles.bar}
        data-state={state}
        aria-label="Compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attachments.add([...e.dataTransfer.files]);
        }}
      >
        <AiOrb
          state={state}
          disabled={busy || preparing}
          onClick={() => (recording ? recorder.stop() : void recorder.start())}
        />
        {capturing ? (
          <CaptureStatus recorder={recorder} />
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
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                const text = e.clipboardData.getData("text/plain");
                if (!files.length && text.length <= ATTACHMENT_LIMITS.pasteChars) return;
                e.preventDefault();
                void (files.length ? attachments.add(files) : attachments.addText(text));
              }}
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
            <IconButton
              label="Attach sheet music"
              tooltip="Attach a picture, PDF or text of the music · sent to Meta to read"
              tooltipSide="top"
              className={styles.attach}
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              <Paperclip size={20} />
            </IconButton>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept={ACCEPTED_FILES}
              onChange={(e) => {
                void attachments.add([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            {accessory}
            {busy ? (
              <button type="button" className={styles.send} aria-label="Stop" onClick={onStop}>
                <Stop size={16} weight="fill" />
              </button>
            ) : (
              <button className={styles.send} aria-label="Send" disabled={!ready}>
                <ArrowUp size={18} weight="bold" />
              </button>
            )}
          </>
        )}
      </form>
      {(recorder.error || attachments.error) && (
        <p className={styles.recorderError} role="alert">
          {recorder.error ?? attachments.error}
        </p>
      )}
    </div>
  );
}

/**
 * The compact pill's content: a live waveform, the time and a button to discard the take, or a
 * note that the take is being read.
 */
function CaptureStatus({ recorder }: { recorder: ReturnType<typeof useVoiceRecorder> }) {
  const { level, seconds } = recorder;
  const recording = recorder.status === "recording";
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
      {recording && (
        <IconButton
          label="Discard take"
          tooltip="Discard"
          shortcut="Esc"
          tooltipSide="top"
          className={styles.discard}
          onClick={recorder.cancel}
        >
          <X size={16} weight="bold" />
        </IconButton>
      )}
    </div>
  );
}
