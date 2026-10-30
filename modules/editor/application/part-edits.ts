import { DEFAULT_PART_VOLUME, INSTRUMENTS, type InstrumentId, type Operation, type Score } from "@/modules/score";

/** One part as the Instruments panel and the mixer show it. */
export type PartRow = {
  id: string;
  name: string;
  instrument: InstrumentId;
  /** Shown on two staves (a piano's grand staff). */
  grandStaff: boolean;
  /** Only a piano can have a grand staff. */
  canGrandStaff: boolean;
  /** The parts before and after it, to move past; null at either end. */
  previousId: string | null;
  nextId: string | null;
  /** The last part cannot be removed. */
  removable: boolean;
  volume: number;
  muted: boolean;
};

export function partRows(score: Score): PartRow[] {
  return score.parts.map((part, index) => ({
    id: part.id,
    name: part.name,
    instrument: part.instrument,
    grandStaff: part.staves.length > 1,
    canGrandStaff: part.instrument === "piano",
    previousId: score.parts[index - 1]?.id ?? null,
    nextId: score.parts[index + 1]?.id ?? null,
    removable: score.parts.length > 1,
    volume: part.volume ?? DEFAULT_PART_VOLUME,
    muted: part.muted ?? false,
  }));
}

/** An edit with the receipt it shows. */
export type PartEdit = { operation: Operation; receipt: string };

/** Moving a part one place up (before the previous part) or down (before the one after next). */
export function movePartEdit(score: Score, row: PartRow, direction: "up" | "down"): PartEdit | null {
  const ids = score.parts.map((part) => part.id);
  const index = ids.indexOf(row.id);
  if (direction === "up") {
    if (!row.previousId) return null;
    return {
      operation: { type: "movePart", partId: row.id, beforePartId: row.previousId },
      receipt: `Moved ${row.name} up`,
    };
  }
  if (!row.nextId) return null;
  const beforePartId = ids[index + 2] ?? null;
  return { operation: { type: "movePart", partId: row.id, beforePartId }, receipt: `Moved ${row.name} down` };
}

export const addPartEdit = (instrument: InstrumentId): PartEdit => ({
  operation: { type: "addPart", instrument },
  receipt: `Added ${INSTRUMENTS[instrument].name}`,
});

export const renamePartEdit = (row: PartRow, name: string): PartEdit | null =>
  name.trim() && name.trim() !== row.name
    ? { operation: { type: "renamePart", partId: row.id, name: name.trim() }, receipt: `Renamed to ${name.trim()}` }
    : null;

export const grandStaffEdit = (row: PartRow): PartEdit => ({
  operation: { type: "setStaffCount", partId: row.id, staves: row.grandStaff ? 1 : 2 },
  receipt: row.grandStaff ? `${row.name}: one staff` : `${row.name}: grand staff`,
});

export const removePartEdit = (row: PartRow): PartEdit => ({
  operation: { type: "removePart", partId: row.id },
  receipt: `Removed ${row.name}`,
});

export const muteEdit = (row: PartRow): PartEdit => ({
  operation: { type: "setPartMix", partId: row.id, muted: !row.muted },
  receipt: row.muted ? `${row.name} unmuted` : `${row.name} muted`,
});

export const volumeEdit = (row: PartRow, volume: number): PartEdit | null =>
  volume === row.volume
    ? null
    : {
        operation: { type: "setPartMix", partId: row.id, volume },
        receipt: `${row.name} volume ${Math.round(volume * 100)}%`,
      };
