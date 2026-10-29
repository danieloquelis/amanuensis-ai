import { useCallback, useEffect, useRef, useState } from "react";
import { listenToLevel, MICROPHONE_CONSTRAINTS, recordingToWav } from "../../infrastructure/browser-audio";

/** Longest take the server accepts. */
export const MAX_TAKE_SECONDS = 120;
/** The timer and level meter refresh this often. */
const TICK_MS = 100;

export type RecorderStatus = "idle" | "recording" | "processing";

/**
 * Records one take from the microphone and hands it over as WAV. Stops by itself at the length
 * limit; the microphone is released as soon as recording stops. `cancel` (or Escape while
 * recording) throws the take away instead of handing it over.
 */
export function useVoiceRecorder(onTake: (wav: Uint8Array) => void) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Live microphone level, 0–1, while recording. */
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const discarded = useRef(false);
  const latestOnTake = useRef(onTake);
  useEffect(() => {
    latestOnTake.current = onTake;
  }, [onTake]);
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    discarded.current = true;
    stop();
  }, [stop]);

  const recording = status === "recording";
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, recording]);

  const start = async () => {
    if (status !== "idle") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MICROPHONE_CONSTRAINTS });
      record(stream);
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === "NotAllowedError";
      setError(denied ? "Allow the microphone to record a take." : "Recording could not start in this browser.");
      setStatus("idle");
    }
  };

  const record = (stream: MediaStream) => {
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    const meter = listenToLevel(stream);
    media.ondataavailable = (event) => chunks.push(event.data);
    media.onstop = async () => {
      meter.close();
      setLevel(0);
      stream.getTracks().forEach((track) => track.stop());
      if (discarded.current) {
        setStatus("idle");
        return;
      }
      setStatus("processing");
      try {
        latestOnTake.current(await recordingToWav(new Blob(chunks, { type: media.mimeType })));
      } catch {
        setError("That recording could not be read. Try again.");
      } finally {
        setStatus("idle");
      }
    };
    recorder.current = media;
    discarded.current = false;
    media.start();
    setStatus("recording");
    setSeconds(0);
    const started = Date.now();
    timer.current = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      setSeconds(Math.floor(elapsed));
      setLevel(meter.level());
      if (elapsed >= MAX_TAKE_SECONDS) stop();
    }, TICK_MS);
  };

  return { status, seconds, level, error, start, stop, cancel };
}
