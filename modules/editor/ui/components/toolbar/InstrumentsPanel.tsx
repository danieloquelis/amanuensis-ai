import { ArrowDown, ArrowUp, Plus, Rows, Trash } from "@phosphor-icons/react";
import { INSTRUMENT_IDS, INSTRUMENTS, type Score } from "@/modules/score";
import {
  addPartEdit,
  grandStaffEdit,
  movePartEdit,
  partRows,
  removePartEdit,
  renamePartEdit,
  type PartEdit,
  type PartRow,
} from "../../../application/part-edits";
import type { ToolTarget } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { InstrumentIcon } from "./InstrumentIcon";
import { InstrumentMenu } from "./InstrumentMenu";
import styles from "./toolbar.module.css";

const ICON = { size: 18, weight: "regular" } as const;
const PART_ICON_SIZE = 20;

type InstrumentsPanelProps = { score: Score; target: ToolTarget; onCommand: CommitEdit };

/**
 * The score's instruments: what the selected lane plays (select a note or a bar in an instrument's
 * lane to switch that one; it is marked in the list), then every part top down (rename in place,
 * move, grand staff for a piano, remove), then one button per instrument to add a part.
 */
export function InstrumentsPanel({ score, target, onCommand }: InstrumentsPanelProps) {
  const commit = (edit: PartEdit | null) => edit && onCommand(edit.operation, edit.receipt);
  return (
    <div className={styles.instruments}>
      <InstrumentMenu score={score} target={target} onCommand={onCommand} onDone={() => {}} />
      <ul className={styles.partList} aria-label="Parts">
        {partRows(score).map((row) => (
          <PartItem key={row.id} row={row} score={score} current={row.id === target.partId} commit={commit} />
        ))}
      </ul>
      <div className={styles.addParts} role="group" aria-label="Add instrument">
        <Plus {...ICON} aria-hidden />
        {INSTRUMENT_IDS.map((instrument) => (
          <button
            key={instrument}
            aria-label={`Add ${INSTRUMENTS[instrument].name}`}
            title={`Add ${INSTRUMENTS[instrument].name}`}
            onClick={() => commit(addPartEdit(instrument))}
          >
            <InstrumentIcon instrument={instrument} size={PART_ICON_SIZE} />
          </button>
        ))}
      </div>
    </div>
  );
}

type PartItemProps = {
  row: PartRow;
  score: Score;
  /** The selected lane's part: the instruments above switch it. */
  current: boolean;
  commit: (edit: PartEdit | null) => void;
};

function PartItem({ row, score, current, commit }: PartItemProps) {
  return (
    <li className={styles.partRow} aria-current={current || undefined}>
      <InstrumentIcon instrument={row.instrument} size={PART_ICON_SIZE} />
      <input
        key={row.name}
        className={styles.partName}
        defaultValue={row.name}
        maxLength={40}
        aria-label={`Name of ${row.name}`}
        onBlur={(e) => {
          commit(renamePartEdit(row, e.target.value));
          if (!e.target.value.trim()) e.target.value = row.name;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        aria-label={`Move ${row.name} up`}
        title="Move up"
        disabled={!row.previousId}
        onClick={() => commit(movePartEdit(score, row, "up"))}
      >
        <ArrowUp {...ICON} />
      </button>
      <button
        aria-label={`Move ${row.name} down`}
        title="Move down"
        disabled={!row.nextId}
        onClick={() => commit(movePartEdit(score, row, "down"))}
      >
        <ArrowDown {...ICON} />
      </button>
      {row.canGrandStaff ? (
        <button
          aria-label={`Grand staff for ${row.name}`}
          title="Grand staff"
          aria-pressed={row.grandStaff}
          onClick={() => commit(grandStaffEdit(row))}
        >
          <Rows {...ICON} />
        </button>
      ) : (
        <span />
      )}
      <button
        aria-label={`Remove ${row.name}`}
        title="Remove"
        disabled={!row.removable}
        onClick={() => commit(removePartEdit(row))}
      >
        <Trash {...ICON} />
      </button>
    </li>
  );
}
