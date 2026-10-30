import { SpeakerSimpleHigh, SpeakerSimpleX } from "@phosphor-icons/react";
import { useState } from "react";
import type { Score } from "@/modules/score";
import { muteEdit, partRows, volumeEdit, type PartEdit, type PartRow } from "../../../application/part-edits";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { InstrumentIcon } from "./InstrumentIcon";
import styles from "./toolbar.module.css";

const ICON = { size: 18, weight: "regular" } as const;
const PART_ICON_SIZE = 20;
/** Volume moves in the steps a part's level is stored in. */
const VOLUME_STEP = 0.05;

/** Each part's mute and volume. A volume is committed once, when the slider is let go. */
export function MixerPanel({ score, onCommand }: { score: Score; onCommand: CommitEdit }) {
  const commit = (edit: PartEdit | null) => edit && onCommand(edit.operation, edit.receipt);
  return (
    <ul className={styles.partList} aria-label="Mixer">
      {partRows(score).map((row) => (
        <MixerRow key={`${row.id}-${row.volume}`} row={row} commit={commit} />
      ))}
    </ul>
  );
}

function MixerRow({ row, commit }: { row: PartRow; commit: (edit: PartEdit | null) => void }) {
  const [volume, setVolume] = useState(row.volume);
  const release = () => commit(volumeEdit(row, volume));
  return (
    <li className={styles.mixerRow}>
      <InstrumentIcon instrument={row.instrument} size={PART_ICON_SIZE} />
      <span className={styles.mixerName}>{row.name}</span>
      <button
        aria-label={`Mute ${row.name}`}
        title={row.muted ? "Unmute" : "Mute"}
        aria-pressed={row.muted}
        onClick={() => commit(muteEdit(row))}
      >
        {row.muted ? <SpeakerSimpleX {...ICON} /> : <SpeakerSimpleHigh {...ICON} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={VOLUME_STEP}
        value={volume}
        aria-label={`${row.name} volume`}
        onChange={(e) => setVolume(Math.round(Number(e.target.value) / VOLUME_STEP) * VOLUME_STEP)}
        onPointerUp={release}
        onKeyUp={release}
      />
    </li>
  );
}
