import { ArrowClockwise } from "@phosphor-icons/react";
import { InstrumentIcon } from "@/modules/editor/ui";
import { INSTRUMENTS } from "@/modules/score";
import type { BandNote } from "../../application/band-board";
import { readableThought, type BandSeat } from "../../application/work-log";
import styles from "./assistant.module.css";

const STATE_LABEL = { waiting: "waiting", playing: "playing", done: "done" } as const;
/** The notes shown while the band works: the latest few, each sliding in as it is said. */
const LIVE_NOTES = 3;

/** A seat's state in words: in a rehearsal, playing is rehearsing. */
const stateOf = (seat: BandSeat) => (seat.state === "playing" && seat.round ? "rehearsing" : STATE_LABEL[seat.state]);

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
 * it is on (two lines at most, each new one sliding in), or its note once done; under it, what the
 * musicians are saying to each other.
 */
export function BandRoom({ seats, talk = [] }: { seats: BandSeat[]; talk?: BandNote[] }) {
  return (
    <>
      <Seats seats={seats} />
      {talk.length > 0 && (
        <ul className={styles.bandTalk} aria-label="The band talking" aria-live="polite">
          {talk.slice(-LIVE_NOTES).map((note, i) => (
            <Said key={talk.length - LIVE_NOTES + i} note={note} />
          ))}
        </ul>
      )}
    </>
  );
}

function Seats({ seats }: { seats: BandSeat[] }) {
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
                <span className={styles.bandState}>{stateOf(seat)}</span>
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

/** One note passed in the band: who said it, to whom, and what. */
function Said({ note }: { note: BandNote }) {
  return (
    <li>
      <span className={styles.bandWho}>
        {note.from} → {note.to === "band" ? "the band" : note.to}
      </span>
      <span>{note.note}</span>
    </li>
  );
}

type BandNotesProps = { seats: BandSeat[]; talk?: BandNote[]; onRedo: (seat: BandSeat) => void };

/**
 * After the band played: each musician's note to the bandleader, with Redo to ask for its part
 * again, and folded under them, what the musicians said to each other.
 */
export function BandNotes({ seats, talk = [], onRedo }: BandNotesProps) {
  return (
    <>
      <PlayedNotes seats={seats} onRedo={onRedo} />
      {talk.length > 0 && (
        <details className={styles.bandTalkLog}>
          <summary>The band talked ({talk.length})</summary>
          <ul className={styles.bandTalk}>
            {talk.map((note, i) => (
              <Said key={i} note={note} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function PlayedNotes({ seats, onRedo }: Omit<BandNotesProps, "talk">) {
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
