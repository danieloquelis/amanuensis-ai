import { scoreKey } from "../key";
import { isWithinPitchRange, movePitch } from "../pitch";
import { locateEvent } from "../queries";
import { overlappingSlurs, slurEnds } from "../slurs";
import { eventPitches, writeNotes } from "../stacks";
import { tieChain } from "../ties";
import type { Draft, OperationContext } from "./draft";
import type { OperationOf } from "./schema";

const OCTAVE_STEPS = 7;

/** Slurs the notes between two events, trimming rests at the ends; overlapped slurs give way. */
export function putSlur(draft: Draft, op: OperationOf<"putSlur">, { idPrefix }: OperationContext) {
  const ends = slurEnds(draft, op.startEventId, op.endEventId);
  const replaced = new Set(overlappingSlurs(draft, ends).map((s) => s.id));
  draft.slurs = [...draft.slurs.filter((s) => !replaced.has(s.id)), { id: `${idPrefix}-slur`, ...ends }];
}

/** Layout only: how much rounder (or flatter) a slur is drawn than its automatic shape. */
export function shapeSlur(draft: Draft, op: OperationOf<"shapeSlur">) {
  const slur = draft.slurs.find((s) => s.id === op.id);
  if (!slur) throw new Error("Slur not found.");
  if (op.lift === null) delete slur.lift;
  else slur.lift = op.lift;
}

/**
 * Moves notes by staff steps. An octave keeps each note's accidental; any other interval is
 * spelled in the key. A note tied to a moved note moves with it, so the tie holds.
 */
export function transpose(draft: Draft, op: OperationOf<"transpose">) {
  const key = scoreKey(draft);
  if (op.steps === 0) throw new Error("Move by at least one step.");
  const ids = new Set(
    op.eventIds.flatMap((id) => {
      locateEvent(draft, id);
      return tieChain(draft, id);
    }),
  );
  const keepsSpelling = op.steps % OCTAVE_STEPS === 0;
  for (const id of ids) {
    const { event } = locateEvent(draft, id);
    if (!event.pitch) continue;
    const moved = eventPitches(event).map((p) => movePitch(p, op.steps, keepsSpelling ? undefined : key));
    if (!moved.every(isWithinPitchRange)) {
      throw new Error("That would move notes beyond A0–C8, the range of any instrument.");
    }
    writeNotes(event, moved);
  }
}
