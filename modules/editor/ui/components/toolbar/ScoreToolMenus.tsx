import { ColumnsPlusRight, Repeat, SpeakerHigh, TextAa } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { meterName, scoreKey, type Score } from "@/modules/score";
import surface from "@/shared/ui/surface.module.css";
import { toolTarget, type Selection } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { ChordEntry } from "./ChordEntry";
import { ChordIcon } from "./ChordIcon";
import { DynamicsRow } from "./DynamicsRow";
import { InstrumentIcon } from "./InstrumentIcon";
import { InstrumentsPanel } from "./InstrumentsPanel";
import { KeyGrid, keyLabel } from "./KeyGrid";
import { MarksPalette } from "./MarksPalette";
import { MeterGrid } from "./MeterGrid";
import { TextEntry } from "./TextEntry";
import { ToolPopover } from "./ToolPopover";
import styles from "./toolbar.module.css";

const ICON = { size: 22, weight: "regular" } as const;

type ScoreToolMenusProps = {
  score: Score;
  selection: Selection | null;
  selectedBarId: string | null;
  /** The instrument lane of a bar picked in one. */
  selectedStaffId?: string | null;
  ready: boolean;
  onCommand: CommitEdit;
  onError: (message: string) => void;
  /** Controls at the start of the pill (playback), split from the tools by a hairline. */
  leading?: ReactNode;
  /** Little room (the chat is docked beside it): on narrower screens the names under the icons go. */
  compact?: boolean;
};

/**
 * Notation tools as one floating pill: each shows an icon (or the current value) over a short
 * name. Every tool acts on the selected note or bar (bar 1 when nothing is selected) and applies
 * on click; Undo is the safety net.
 */
export function ScoreToolMenus({
  score,
  selection,
  selectedBarId,
  selectedStaffId = null,
  ready,
  onCommand,
  onError,
  leading,
  compact = false,
}: ScoreToolMenusProps) {
  const target = toolTarget(score, selection, selectedBarId, selectedStaffId);
  const barKey = `${target.measureId}-${score.revision}`;
  const meter = meterName(score.measures[target.barIndex].meter);
  // The tool shows what plays the selected lane (a note's, or a bar's picked in it), like Time and Key show theirs.
  const { instrument } = score.parts.find((part) => part.id === target.partId)!;
  return (
    <div
      className={`${surface.glass} ${styles.tools}`}
      data-compact={compact}
      role="group"
      aria-label="Notation toolbar"
    >
      {leading}
      {leading && <span className={surface.divider} />}
      <ToolPopover
        icon={<InstrumentIcon instrument={instrument} size={ICON.size} />}
        label="Instrument"
        accessibleLabel="Instruments"
        disabled={!ready}
      >
        <InstrumentsPanel score={score} target={target} onCommand={onCommand} />
      </ToolPopover>
      <ToolPopover
        icon={<span className={styles.valueGlyph}>{meter}</span>}
        label="Time"
        accessibleLabel="Change time signature"
        disabled={!ready}
      >
        {(close) => (
          <MeterGrid score={score} barIndex={target.barIndex} onCommand={onCommand} onError={onError} onDone={close} />
        )}
      </ToolPopover>
      <ToolPopover
        icon={<span className={styles.valueGlyph}>{keyLabel(scoreKey(score))}</span>}
        label="Key"
        accessibleLabel="Change key signature"
        disabled={!ready}
      >
        <KeyGrid key={barKey} score={score} onCommand={onCommand} />
      </ToolPopover>
      <span className={surface.divider} />
      <ToolPopover
        icon={<ChordIcon size={ICON.size} />}
        label="Chords"
        accessibleLabel="Chord symbols"
        disabled={!ready}
      >
        <ChordEntry key={target.eventId ?? target.measureId} score={score} target={target} onCommand={onCommand} />
      </ToolPopover>
      <ToolPopover icon={<SpeakerHigh {...ICON} />} label="Dynamics" accessibleLabel="Dynamics" disabled={!ready}>
        <DynamicsRow score={score} target={target} onCommand={onCommand} />
      </ToolPopover>
      <ToolPopover icon={<TextAa {...ICON} />} label="Text" accessibleLabel="Text indications" disabled={!ready}>
        {(close) => <TextEntry target={target} onCommand={onCommand} onDone={close} />}
      </ToolPopover>
      <span className={surface.divider} />
      <ToolPopover icon={<Repeat {...ICON} />} label="Repeats" accessibleLabel="Marks and repeats" disabled={!ready}>
        <MarksPalette score={score} barIndex={target.barIndex} onCommand={onCommand} onError={onError} />
      </ToolPopover>
      <button
        className={styles.tool}
        disabled={!ready}
        aria-label="Add bar"
        onClick={() => onCommand({ type: "appendMeasure", afterMeasureId: target.measureId }, "Added bar")}
      >
        <span className={styles.toolIcon}>
          <ColumnsPlusRight {...ICON} />
        </span>
        <span className={styles.toolLabel}>Add bar</span>
      </button>
    </div>
  );
}
