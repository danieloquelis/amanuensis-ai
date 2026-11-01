import { ArrowClockwise } from "@phosphor-icons/react";
import { InstrumentIcon } from "@/modules/editor/ui";
import { INSTRUMENTS } from "@/modules/score";
import { readableThought, type BandSeat } from "../../application/work-log";
import styles from "./assistant.module.css";

const STATE_LABEL = { waiting: "waiting", playing: "playing", done: "done" } as const;

/** The sentence a musician is on: its thinking streams in sentence by sentence. */
const latestSentence = (text: string) =>
  readableThought(text)
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .at(-1);

/** Who a seat is: the player's name with their instrument, or the instrument alone. */
const who = (seat: BandSeat) => {
  const instrument = INSTRUMENTS[seat.instrument].name;
  return seat.name === instrument ? instrument : `${seat.name} · ${instrument}`;
};

/**
 * While the band plays: one row per musician, in rehearsal order, with its state and the thought
 * it is on (two lines at most, each new one sliding in), or its note once done.
 */
export function BandRoom({ seats }: { seats: BandSeat[] }) {
  return (
    <ol className={styles.bandRoom} aria-label="The band">
      {seats.map((seat) => {
        const line = seat.state === "done" ? seat.report : seat.thought && latestSentence(seat.thought);
        return (
          <li key={seat.part} data-state={seat.state}>
            <span className={styles.bandIcon} aria-hidden="true">
              <InstrumentIcon instrument={seat.instrument} size={16} />
            </span>
            <span className={styles.bandSeat}>
              <span className={styles.bandWho}>
                {who(seat)}
                <span className={styles.bandState}>{STATE_LABEL[seat.state]}</span>
              </span>
              {line && (
                <span key={line} className={styles.bandLine}>
                  {line}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** After the band played: each musician's note to the bandleader, with Redo to ask for its part again. */
export function BandNotes({ seats, onRedo }: { seats: BandSeat[]; onRedo: (seat: BandSeat) => void }) {
  return (
    <ul className={styles.bandRoom} aria-label="What the band played">
      {seats.map((seat) => (
        <li key={seat.part} data-state="done">
          <span className={styles.bandIcon} aria-hidden="true">
            <InstrumentIcon instrument={seat.instrument} size={16} />
          </span>
          <span className={styles.bandSeat}>
            <span className={styles.bandWho}>{who(seat)}</span>
            {seat.report && <span className={styles.bandNote}>{seat.report}</span>}
          </span>
          <button type="button" className={styles.turnAction} onClick={() => onRedo(seat)}>
            <ArrowClockwise size={13} weight="bold" />
            Redo
          </button>
        </li>
      ))}
    </ul>
  );
}
