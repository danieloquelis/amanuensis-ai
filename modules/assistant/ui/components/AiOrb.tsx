import { Microphone, Stop } from "@phosphor-icons/react";
import styles from "./assistant.module.css";

type AiOrbProps = {
  /** Idle turns slowly; working turns faster; listening glows red with a stop icon. */
  state: "idle" | "working" | "listening";
  disabled?: boolean;
  onClick: () => void;
};

/**
 * The AI's voice button: a glassy sphere of slowly turning greens with a microphone on it. Tap
 * to sing, hum or talk; tap again to stop.
 */
export function AiOrb({ state, disabled, onClick }: AiOrbProps) {
  const listening = state === "listening";
  return (
    <button
      type="button"
      className={styles.orb}
      data-state={state}
      aria-label={listening ? "Stop recording" : "Record a take"}
      disabled={disabled}
      onClick={onClick}
    >
      {listening ? <Stop size={18} weight="fill" /> : <Microphone size={22} weight="fill" />}
    </button>
  );
}
