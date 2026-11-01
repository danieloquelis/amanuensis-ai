import { z } from "zod";
import {
  barEvents,
  findPart,
  INSTRUMENT_IDS,
  INSTRUMENTS,
  isDrumKit,
  isPlayable,
  midiPitch,
  partHandles,
  type InstrumentId,
  type Score,
} from "@/modules/score";
import type { ToolSpec } from "./model-port";
import { rehearsalOrder, type BandMember } from "./musicians";
import { runMusician, type BandContext, type MusicianJob } from "./run-musician";
import { toolError } from "./score-tool-gateway";
import { toolParameters } from "./tool-definitions";

export const BAND_ARRANGE = "band_arrange";
const BAND_REVIEW = "band_review";

const arrangeSchema = z.strictObject({
  feel: z.string().trim().min(1).max(300).describe("The style and feel the whole band plays in, and the passage."),
  parts: z
    .array(
      z.strictObject({
        part: z.string().describe('An existing part\'s handle ("piano", "bass"), or an instrument to add.'),
        brief: z.string().trim().min(1).max(400).describe("What this musician should play, in a musician's words."),
      }),
    )
    .min(1)
    .max(8),
});

export const bandToolSpecs: ToolSpec[] = [
  {
    name: BAND_ARRANGE,
    description: `Have the band play an arrangement: each part is written by its own musician, in rehearsal order (drums, bass, harmony, then lead lines), each hearing those before it and writing only its own part. Missing parts are added. Returns each musician's report. Instruments: ${INSTRUMENT_IDS.join(", ")}.`,
    parameters: toolParameters(arrangeSchema),
  },
  {
    name: BAND_REVIEW,
    description:
      "Check the band's parts: notes outside an instrument's range, and bars a part left empty where others play. Send a musician back (band_arrange with that part and your notes) for what matters.",
    parameters: toolParameters(z.strictObject({})),
  },
];

const BAND_TOOLS = new Set([BAND_ARRANGE, BAND_REVIEW]);
export const isBandTool = (name: string) => BAND_TOOLS.has(name);

/** What a musician told the bandleader, kept for the turn's result. */
export type BandReport = { part: string; instrument: InstrumentId; name: string; report: string };

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** Problems the band's parts show, by part and bar: out of range, or silent where others play. */
function review(score: Score): string[] {
  const handles = partHandles(score);
  const busy = score.measures.map((measure) =>
    score.parts.some((part) =>
      part.staves.some((staff) => barEvents(measure, staff.voices[0].id).some((event) => event.pitch || event.drums)),
    ),
  );
  return score.parts.flatMap((part) => {
    const handle = handles.get(part.id) ?? part.id;
    const out: string[] = [];
    const empty: number[] = [];
    score.measures.forEach((measure, i) => {
      const events = part.staves.flatMap((staff) => staff.voices.flatMap((voice) => barEvents(measure, voice.id)));
      if (busy[i] && !events.some((event) => event.pitch || event.drums)) empty.push(i + 1);
      if (isDrumKit(part.instrument)) return;
      for (const event of events) {
        if (event.pitch && !isPlayable(midiPitch(event.pitch), part.instrument)) out.push(`bar ${i + 1}`);
      }
    });
    return [
      ...(out.length ? [`${handle}: notes outside its range in ${[...new Set(out)].join(", ")}`] : []),
      ...(empty.length ? [`${handle}: silent in bars ${empty.join(", ")} while others play`] : []),
    ];
  });
}

/**
 * The band, for one turn: `band_arrange` runs each musician in rehearsal order on the turn's own
 * edits (one undo step), `band_review` checks the result. `members` are the musician's band, as
 * they described it; `reports` collects what each musician said.
 */
export function createBandTools(context: BandContext, members: BandMember[]) {
  const reports: BandReport[] = [];

  /** The part a brief names, added first when the score has no such part yet. */
  const resolve = (ref: string): { part: string; instrument: InstrumentId } => {
    const existing = findPart(context.score(), ref);
    const score = existing ? context.score() : null;
    if (existing && score) return { part: partHandles(score).get(existing.id) ?? ref, instrument: existing.instrument };
    if (!(INSTRUMENT_IDS as readonly string[]).includes(ref))
      throw new Error(`There is no part or instrument "${ref}".`);
    const before = context.score();
    const added = context.tools("score_edit", {
      requestId: `${context.turnId}-band-add-${ref}`,
      expectedRevision: before.revision,
      operation: { type: "addPart", instrument: ref },
    });
    if (!added.ok) throw new Error(added.error);
    const after = context.score();
    const part = after.parts.findLast((p) => p.instrument === ref)!;
    context.onEdits();
    return { part: partHandles(after).get(part.id) ?? part.id, instrument: ref as InstrumentId };
  };

  /**
   * A piano part that already holds the song's melody (the lead sheet sung or played in) keeps it:
   * the pianist gets a left-hand staff to comp on, added before it plays. Returns what to tell it.
   */
  const keepMelody = (part: string, instrument: InstrumentId): string | null => {
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
  };

  const arrange = async (raw: unknown): Promise<ToolResult> => {
    const { feel, parts } = arrangeSchema.parse(raw);
    const unused = [...members];
    const jobs: MusicianJob[] = parts.map(({ part, brief }) => {
      const resolved = resolve(part);
      const at = unused.findIndex((member) => member.instrument === resolved.instrument);
      const member = at === -1 ? undefined : unused.splice(at, 1)[0];
      const kept = keepMelody(resolved.part, resolved.instrument);
      const fullBrief = kept ? `${brief} ${kept}` : brief;
      return { ...resolved, brief: fullBrief, member, name: member?.name ?? INSTRUMENTS[resolved.instrument].name };
    });
    const ordered = rehearsalOrder(jobs);
    for (const job of ordered) {
      context.onProgress({
        stage: "musician",
        part: job.part,
        instrument: job.instrument,
        name: job.name,
        state: "waiting",
      });
    }
    const heard: string[] = [];
    for (const job of ordered) {
      const { report } = await runMusician(context, job, feel, heard);
      heard.push(`${job.name} (${job.part}): ${report}`);
      reports.push({ part: job.part, instrument: job.instrument, name: job.name, report });
    }
    return { ok: true, played: heard, next: "band_review, then reply: what the band played, by musician." };
  };

  return {
    reports: () => reports,
    async run(name: string, raw: unknown): Promise<ToolResult> {
      try {
        if (name === BAND_ARRANGE) return await arrange(raw);
        const problems = review(context.score());
        return { ok: true, problems: problems.length ? problems : ["none: every part in range, no part silent"] };
      } catch (error) {
        return { ok: false, error: toolError(error) };
      }
    },
  };
}

/** The band as the bandleader reads it in its context, when Band Mode is on. */
export function bandContext(members: BandMember[]): string {
  const line = (member: BandMember) => {
    const who = member.name ? `${member.name}` : "";
    const note = member.note ? `${who ? ": " : ""}${member.note}` : "";
    return `- ${INSTRUMENTS[member.instrument].name}${who || note ? ` (${who}${note})` : ""}`;
  };
  return members.length
    ? `Band Mode is on. The musician's band:\n${members.map(line).join("\n")}`
    : "Band Mode is on. The band is whoever plays in the score.";
}
