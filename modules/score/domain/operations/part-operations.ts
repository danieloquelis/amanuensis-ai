import { INSTRUMENTS } from "../instruments";
import { getPart, getStaff } from "../queries";
import type { Draft } from "./draft";
import type { OperationOf } from "./schema";

/**
 * Plays a part on another instrument. Pitches are stored as they sound, so the music sounds the
 * same; each staff takes the instrument's clef (a piano's second staff the bass clef).
 */
export function setInstrument(draft: Draft, op: OperationOf<"setInstrument">) {
  const part = getPart(draft, op.partId);
  const instrument = INSTRUMENTS[op.instrument];
  if (part.staves.length > 1 && op.instrument !== "piano") {
    throw new Error(`${instrument.name} plays from one staff; this part has two. Only piano uses two staves.`);
  }
  part.instrument = op.instrument;
  part.name = op.name ?? instrument.name;
  delete part.abbreviation;
  part.staves.forEach((staff, index) => (staff.clef = index === 0 ? instrument.clef : "bass"));
}

/** Changes a staff's clef; the notes keep their sound and are drawn on other lines. */
export function setClef(draft: Draft, op: OperationOf<"setClef">) {
  getStaff(draft, op.staffId).clef = op.clef;
}
