import { barEvents, findPart, INSTRUMENT_IDS, partHandles, type InstrumentId } from "@/modules/score";
import type { z } from "zod";
import type { arrangeSchema } from "./band-specs";
import { musicianName, roleOf } from "./musicians";
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

/**
 * The band for an arrangement: each part named (added when missing), the tune placed as the
 * bandleader planned it before anyone plays, and each musician's brief, with where it carries the
 * tune (and must keep it) or where others do. Without a plan, a piano holding the melody keeps it
 * and comps on a left hand, and the lead lines are told not to double it.
 */
export function castBand(context: BandContext, arrangement: z.infer<typeof arrangeSchema>): MusicianJob[] {
  const tune = findTune(context.score());
  const cast = arrangement.parts.map(({ part, brief }) => ({ ...resolvePart(context, part), brief }));
  const plan = arrangement.tune?.length ? arrangement.tune : null;
  const tuneParts = plan ? playTunePlan(context, plan, tune) : null;
  let melodyOn: string | null = null;
  const jobs: MusicianJob[] = cast.map(({ part, instrument, brief }) => {
    const leftHand = keepMelody(context, part, instrument);
    if (leftHand) melodyOn = part;
    // With a plan, the tune brief says where the piano keeps the melody; the left hand is for comping.
    const kept = leftHand && plan ? `You have a left-hand staff to comp on (bar N ${part}.2: …).` : leftHand;
    const told = [brief, kept, plan && tuneParts ? tuneBrief(part, plan, tuneParts, Boolean(tune)) : null];
    const keep = tuneParts?.get(part)?.kept;
    return {
      part,
      instrument,
      name: musicianName(instrument, part),
      brief: told.filter(Boolean).join(" "),
      ...(keep?.length ? { kept: keep } : {}),
    };
  });
  // No plan, and the tune already sounds on the piano: a lead line answers it rather than doubling it.
  for (const job of plan ? [] : jobs) {
    if (melodyOn && job.part !== melodyOn && roleOf(job.instrument) === "lead") {
      job.brief += ` The song's melody is already played by ${melodyOn}: don't double it note for note; answer it, harmonise it or play a countermelody, unless your brief says you take the melody.`;
    }
  }
  return jobs;
}
