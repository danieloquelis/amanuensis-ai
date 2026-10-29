import { INSTRUMENTS } from "../instruments";
import { getStaff } from "../queries";
import type { Part } from "../schema";
import type { Draft } from "./draft";
import type { OperationOf } from "./schema";

/** A part by ID; the first part when omitted. */
function getPart(draft: Draft, id?: string): Part {
  const part = id === undefined ? draft.parts[0] : draft.parts.find((p) => p.id === id);
  if (!part) throw new Error("That part is not in the score.");
  return part;
}

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
