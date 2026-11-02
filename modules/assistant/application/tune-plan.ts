import { z } from "zod";
import { barEvents, findPart, INSTRUMENTS, isPlayable, midiPitch, staffHandle, type Score } from "@/modules/score";
import { resolvePart } from "./band-setup";
import type { BandContext } from "./run-musician";
import { keptBars, type KeptBar, type TuneLine } from "./tune-line";

export const tuneSchema = z
  .array(
    z.strictObject({
      from: z.number().int().min(1).describe("First bar of the passage."),
      to: z.number().int().min(1).describe("Last bar of the passage."),
      parts: z
        .array(z.string())
        .min(1)
        .max(4)
        .describe('Who plays the tune here: one part, or several in unison or octaves ("trumpet", "piano").'),
    }),
  )
  .max(16)
  .describe(
    "How the song's tune moves through the band, passage by passage, over the whole piece: who carries it where (a new voice on a repeat, several together to build). Cover the bars the tune plays.",
  );
export type TunePlan = z.infer<typeof tuneSchema>;

/** Octaves a copied tune may move, up or down, to sit in its new instrument's range. */
const OCTAVES = [0, 1, -1, 2, -2];
const OCTAVE_STEPS = 7;
const OCTAVE = 12;

/** The tune as planned, for each part handle: the bars it carries (to keep) and in words. */
export type TuneParts = Map<string, { kept: KeptBar[]; bars: string[]; with: string[] }>;

const range = (score: Score, from: number, to: number) =>
  score.measures.slice(Math.max(0, from - 1), Math.min(score.measures.length, to)).map((m) => m.id);

/**
 * Plays the plan out on the score before the band plays: the tune is copied (from where it is
 * now) to each part that carries a passage, moved by octaves into that instrument's range, and
 * taken off its first staff where another part carries it instead. Returns, by part, the bars it
 * now carries, which its musician must keep.
 */
export function playTunePlan(context: BandContext, plan: TunePlan, tune: TuneLine | null): TuneParts {
  const parts: TuneParts = new Map();
  const edit = (id: string, operation: unknown) => {
    const done = context.tools("score_edit", {
      requestId: `${context.turnId}-tune-${id}`,
      expectedRevision: context.score().revision,
      operation,
    });
    if (!done.ok) throw new Error(done.error);
  };
  plan.forEach((span, n) => {
    const bars = range(context.score(), span.from, span.to);
    if (!bars.length) return;
    const handles = span.parts.map((ref) => resolvePart(context, ref).part);
    for (const handle of handles) {
      const staff = findPart(context.score(), handle)!.staves[0];
      if (tune && staff.id !== tune.staffId) {
        const toStaffId = staffHandle(context.score(), staff.id) ?? handle;
        edit(`${n}-${handle}`, {
          type: "copyBars",
          measureIds: bars,
          toMeasureId: bars[0],
          fromStaffId: tune.handle,
          toStaffId,
        });
        fitOctave(context, handle, staff.voices[0].id, bars, edit);
      }
      const entry = parts.get(handle) ?? { kept: [], bars: [], with: [] };
      // Only a tune already written is kept: with none yet, the musician writes it there.
      // Bars where the tune rests stay free: the part may fill them.
      if (tune) entry.kept.push(...keptBars(context.score(), staff.voices[0].id, bars).filter((bar) => bar.notes));
      entry.bars.push(span.from === span.to ? `${span.from}` : `${span.from}–${span.to}`);
      entry.with.push(...handles.filter((other) => other !== handle && !entry.with.includes(other)));
      parts.set(handle, entry);
    }
    // Where another part carries it, the tune's own staff is freed for its player to comp.
    if (tune && !handles.some((handle) => findPart(context.score(), handle)?.id === tune.partId)) {
      bars.forEach((measureId, k) =>
        edit(`${n}-clear-${k}`, { type: "clearMeasure", measureId, staffId: tune.handle }),
      );
    }
  });
  context.onEdits();
  return parts;
}

/** Moves the copied passage by whole octaves to the fewest notes out of range, nearest the middle. */
function fitOctave(
  context: BandContext,
  handle: string,
  voiceId: string,
  bars: string[],
  edit: (id: string, operation: unknown) => void,
) {
  const score = context.score();
  const instrument = findPart(score, handle)!.instrument;
  const events = score.measures
    .filter((measure) => bars.includes(measure.id))
    .flatMap((measure) => barEvents(measure, voiceId))
    .filter((event) => event.pitch);
  if (!events.length) return;
  const midi = events.map((event) => midiPitch(event.pitch!));
  const { low, high } = INSTRUMENTS[instrument].range;
  const middle = (low + high) / 2;
  const cost = (octave: number) => {
    const moved = midi.map((m) => m + octave * OCTAVE);
    const out = moved.filter((m) => !isPlayable(m, instrument)).length;
    const mean = moved.reduce((sum, m) => sum + m, 0) / moved.length;
    return out * OCTAVE * 4 + Math.abs(mean - middle);
  };
  const best = OCTAVES.reduce((a, b) => (cost(b) < cost(a) ? b : a));
  if (best)
    edit(`octave-${handle}`, { type: "transpose", eventIds: events.map((e) => e.id), steps: best * OCTAVE_STEPS });
}

/** The plan in a line: "bars 1–8: trumpet; bars 9–16: piano and trumpet". */
export const tuneInWords = (plan: TunePlan) =>
  plan.map((span) => `bars ${span.from}–${span.to}: ${span.parts.join(" and ")}`).join("; ");

/** What a musician is told about the tune: where it carries it, or where it is played by others. */
export function tuneBrief(part: string, plan: TunePlan, parts: TuneParts, written: boolean): string {
  const mine = parts.get(part);
  const all = `The tune, as planned: ${tuneInWords(plan)}.`;
  if (!mine) return `${all} Where it plays, stay out of its way (under it, or answering in its rests).`;
  const together = mine.with.length ? ` (with ${mine.with.join(" and ")} there too: unison or octaves)` : "";
  const how = written
    ? "it is already written in your part: keep its notes and where they start, and phrase it (articulation, dynamics, breath)"
    : "write the tune there, in your part";
  return `${all} You carry it in bars ${mine.bars.join(", ")}${together}: ${how}. Elsewhere, play your brief.`;
}
