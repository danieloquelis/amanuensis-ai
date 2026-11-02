import { barEvents, findPart, INSTRUMENT_IDS, partHandles, type InstrumentId, type Score } from "@/modules/score";
import type { z } from "zod";
import type { arrangeSchema } from "./band-specs";
import { musicianName } from "./musicians";
import type { BandContext, MusicianJob } from "./run-musician";
import { findTune } from "./tune-line";
import { playTunePlan, tuneBrief } from "./tune-plan";

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
 * A piano part that still holds some of the song's tune after the plan placed it gets a
 * left-hand staff to comp on, added before it plays. Returns what to tell the pianist.
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
  return `You have a left-hand staff to comp on (bar N ${part}.2: …).`;
}

/**
 * The band for an arrangement: each part named (added when missing), the tune placed as the
 * bandleader planned it before anyone plays, and each musician's brief, with where it carries the
 * tune (and must keep it) or where others do. A song with a tune must come with a plan for it.
 */
export function castBand(context: BandContext, arrangement: z.infer<typeof arrangeSchema>): MusicianJob[] {
  const tune = findTune(context.score());
  const plan = arrangement.tune?.length ? arrangement.tune : null;
  // A song with a tune gets a plan for it, so where it goes is placed and kept, not left to the musicians.
  if (tune && !plan) {
    throw new Error(
      `The song has a tune (on ${tune.handle}). Say how it moves through the band in tune: who carries it in which bars, over the whole piece.`,
    );
  }
  const cast = arrangement.parts.map(({ part, brief }) => ({ ...resolvePart(context, part), brief }));
  const tuneParts = plan ? playTunePlan(context, plan, tune) : null;
  return cast.map(({ part, instrument, brief }) => {
    const leftHand = keepMelody(context, part, instrument);
    const told = [brief, leftHand, plan && tuneParts ? tuneBrief(part, plan, tuneParts, Boolean(tune)) : null];
    const keep = tuneParts?.get(part)?.kept;
    return {
      part,
      instrument,
      name: musicianName(instrument, part),
      brief: told.filter(Boolean).join(" "),
      ...(keep?.length ? { kept: keep } : {}),
    };
  });
}

/** What a musician seated from the song is told: its part is what the composer heard. */
const AS_IT_STANDS =
  "Your part as it stands in the song: the composer has heard it. Rework it where the Bandleader's notes ask, and keep the rest.";

/**
 * The band already in the song, on a later turn: one musician per part, with the name it had when
 * it first played (names follow the part), so the bandleader can pass the composer's comments on.
 */
export function songBand(score: Score): MusicianJob[] {
  const handles = partHandles(score);
  return score.parts.map((part) => {
    const handle = handles.get(part.id) ?? part.id;
    return {
      part: handle,
      instrument: part.instrument,
      name: musicianName(part.instrument, handle),
      brief: AS_IT_STANDS,
    };
  });
}
