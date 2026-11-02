import { barEvents, findPart, INSTRUMENT_IDS, partHandles, type InstrumentId } from "@/modules/score";
import type { BandContext } from "./run-musician";

/** The part a brief names, added first when the score has no such part yet. */
export function resolvePart(context: BandContext, ref: string): { part: string; instrument: InstrumentId } {
  const score = context.score();
  const existing = findPart(score, ref);
  if (existing) return { part: partHandles(score).get(existing.id) ?? ref, instrument: existing.instrument };
  if (!(INSTRUMENT_IDS as readonly string[]).includes(ref)) throw new Error(`There is no part or instrument "${ref}".`);
  const added = context.tools("score_edit", {
    requestId: `${context.turnId}-band-add-${ref}`,
    expectedRevision: score.revision,
    operation: { type: "addPart", instrument: ref },
  });
  if (!added.ok) throw new Error(added.error);
  const after = context.score();
  const part = after.parts.findLast((p) => p.instrument === ref)!;
  context.onEdits();
  return { part: partHandles(after).get(part.id) ?? part.id, instrument: ref as InstrumentId };
}

/**
 * A piano part that already holds the song's melody (the lead sheet sung or played in) keeps it:
 * the pianist gets a left-hand staff to comp on, added before it plays. Returns what to tell it.
 */
export function keepMelody(context: BandContext, part: string, instrument: InstrumentId): string | null {
  const score = context.score();
  const found = findPart(score, part);
  if (instrument !== "piano" || !found || found.staves.length > 1) return null;
  const melody = score.measures.some((m) => barEvents(m, found.staves[0].voices[0].id).some((e) => e.pitch));
  if (!melody) return null;
  const added = context.tools("score_edit", {
    requestId: `${context.turnId}-band-left-hand`,
    expectedRevision: score.revision,
    operation: { type: "setStaffCount", partId: found.id, staves: 2 },
  });
  if (!added.ok) return null;
  context.onEdits();
  return `Your first staff holds the song's melody: keep it as it is, and comp on your left-hand staff (bar N ${part}.2: …).`;
}
