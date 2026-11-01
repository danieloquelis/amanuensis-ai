import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  FilePdf,
  FileText,
  Image as ImageIcon,
  Microphone,
  Timer,
  WarningCircle,
} from "@phosphor-icons/react";
import type { TakePart } from "@/modules/voice";
import { answerTime } from "../../application/chat-history";
import { sungLength, type Turn } from "../hooks/use-assistant";
import { useActivityLine } from "../hooks/use-activity-line";
import type { BandSeat } from "../../application/work-log";
import { BandNotes, BandRoom } from "./BandRoom";
import { LiveThought, PlanChecklist, WorkSummary } from "./WorkLog";
import styles from "./assistant.module.css";

type TurnBubblesProps = {
  turn: Turn;
  canUndo: boolean;
  /** A failed turn from this session can be sent again as it was (a take without singing again). */
  canRetry: boolean;
  busy: boolean;
  onUndo: () => void;
  onRetry: () => void;
  onChoose: (text: string) => void;
  onRedo: (seat: BandSeat) => void;
};

/**
 * One exchange: the musician's message as a bubble on the right (what it was about on top, a ♪
 * where they sang), then the AI's answer on the left, with what changed as quiet receipts, any
 * choices to tap, Undo (or Retry when it failed), and how long the answer took.
 */
export function TurnBubbles({ turn, ...actions }: TurnBubblesProps) {
  return (
    <li className={styles.exchange}>
      <div className={styles.mine}>
        {(turn.context || turn.spoken) && (
          <span className={styles.mineMeta}>
            {turn.spoken && <Microphone size={11} weight="fill" aria-label="Spoken" />}
            {turn.context && <span className={styles.contextChip}>{turn.context}</span>}
          </span>
        )}
        {turn.attachments?.length ? <SentFiles files={turn.attachments} /> : null}
        {(turn.heard?.length || turn.instruction) && (
          <span>{turn.heard?.length ? <HeardParts parts={turn.heard} /> : turn.instruction}</span>
        )}
      </div>
      <div className={styles.theirs} data-failed={turn.status === "failed"}>
        {turn.status === "working" ? <Thinking turn={turn} /> : <Answer turn={turn} {...actions} />}
      </div>
    </li>
  );
}

const FILE_ICONS = { image: ImageIcon, pdf: FilePdf, text: FileText };

/** The files a request carried, by name. */
function SentFiles({ files }: { files: NonNullable<Turn["attachments"]> }) {
  return (
    <span className={styles.sentFiles} aria-label="Attached files">
      {files.map(({ name, kind }, i) => {
        const Icon = FILE_ICONS[kind];
        return (
          <span key={i} className={styles.sentFile}>
            <Icon size={13} />
            {name}
          </span>
        );
      })}
    </span>
  );
}

/** A take in order: what was said, with a ♪ pill where they sang. */
function HeardParts({ parts }: { parts: TakePart[] }) {
  return parts.map((part, i) =>
    part.kind === "said" ? (
      <span key={i}>{part.text} </span>
    ) : (
      <span key={i} className={styles.sungChip} aria-label={`sang ${sungLength(part.seconds)}`}>
        ♪ {sungLength(part.seconds)}
      </span>
    ),
  );
}

/** While it works: its plan, its latest thought, and what it is doing now. */
function Thinking({ turn }: { turn: Turn }) {
  const line = useActivityLine(turn.activity);
  return (
    <div className={`${styles.answer} ${styles.thinking}`}>
      {turn.plan?.length ? <PlanChecklist steps={turn.plan} /> : null}
      {turn.band?.length ? <BandRoom seats={turn.band} /> : turn.log?.length ? <LiveThought log={turn.log} /> : null}
      <span key={line} className={styles.activity} role="status">
        {line}…
      </span>
    </div>
  );
}

function Answer({ turn, canUndo, canRetry, busy, onUndo, onRetry, onChoose, onRedo }: TurnBubblesProps) {
  const changes = turn.changes ?? [];
  return (
    <div className={styles.answer}>
      {turn.plan?.length ? <PlanChecklist steps={turn.plan} /> : null}
      {turn.log?.length ? <WorkSummary log={turn.log} seconds={turn.seconds} /> : null}
      <p>
        {turn.status === "failed" && <WarningCircle className={styles.warning} size={16} weight="fill" />}
        {turn.reply}
      </p>
      {turn.band?.some((seat) => seat.report) ? <BandNotes seats={turn.band} onRedo={onRedo} /> : null}
      {turn.question && (
        <div className={styles.choices}>
          {turn.question.choices.map((choice) => (
            <button key={choice} disabled={busy} onClick={() => onChoose(choice)}>
              {choice}
            </button>
          ))}
        </div>
      )}
      {(changes.length > 0 || canUndo || canRetry || turn.seconds !== undefined) && (
        <div className={styles.receipts}>
          {changes.length > 0 && (
            <ul aria-label="Changes">
              {changes.map((change) => (
                <li key={change}>
                  <Check size={12} weight="bold" />
                  {change}
                </li>
              ))}
            </ul>
          )}
          {canUndo && (
            <button className={styles.turnAction} onClick={onUndo}>
              <ArrowCounterClockwise size={13} weight="bold" />
              Undo
            </button>
          )}
          {canRetry && (
            <button className={styles.turnAction} disabled={busy} onClick={onRetry}>
              <ArrowClockwise size={13} weight="bold" />
              Retry
            </button>
          )}
          {turn.seconds !== undefined && (
            <span className={styles.answerTime} aria-label={`Answered in ${answerTime(turn.seconds)}`}>
              <Timer size={12} />
              {answerTime(turn.seconds)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
