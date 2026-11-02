import { z } from "zod";
import {
  barEvents,
  eventOnsets,
  findPart,
  isRest,
  partHandles,
  scoreText,
  soundingBeats,
  type Operation,
  type Score,
} from "@/modules/score";

/**
 * The band's material: the ideas the bandleader composed before the band plays (a subject and
 * countersubject, a hook, a riff, a motif), each where it is written. Musicians quote and develop
 * them with band_motif, so the parts grow from the same ideas instead of each inventing its own.
 */
export const materialSchema = z
  .array(
    z.strictObject({
      name: z
        .string()
        .trim()
        .min(1)
        .max(30)
        .describe('What it is called: "subject", "countersubject", "hook", "riff".'),
      part: z.string().describe("The part it is written in, already (write it first with score_write)."),
      from: z.number().int().min(1).describe("Its first bar."),
      to: z.number().int().min(1).describe("Its last bar."),
      about: z.string().trim().max(200).optional().describe("What it is for, in a musician's words."),
    }),
  )
  .max(6)
  .describe(
    "The material you composed and wrote before the band plays, where it is: every part grows from it (quoted, moved, inverted, augmented, in pieces).",
  );

export type MaterialEntry = z.infer<typeof materialSchema>[number];
/** A named idea, as written in the score: its part's first voice over a run of bars. */
export type Material = MaterialEntry & { handle: string; voiceId: string; measureIds: string[] };

/** The material as the score holds it; throws when an entry names a part or bars without its notes. */
export function readMaterial(score: Score, entries: MaterialEntry[]): Material[] {
  const handles = partHandles(score);
  return entries.map((entry) => {
    const part = findPart(score, entry.part);
    if (!part) throw new Error(`Material "${entry.name}": there is no part ${entry.part}. Write it first.`);
    const voiceId = part.staves[0].voices[0].id;
    const measureIds = score.measures.slice(entry.from - 1, entry.to).map((m) => m.id);
    const notes = score.measures
      .filter((m) => measureIds.includes(m.id))
      .some((m) => barEvents(m, voiceId).some((e) => !isRest(e)));
    if (!measureIds.length || !notes) {
      throw new Error(
        `Material "${entry.name}": ${entry.part} has no notes in bars ${entry.from}–${entry.to}. Write it there with score_write first.`,
      );
    }
    return { ...entry, handle: handles.get(part.id) ?? entry.part, voiceId, measureIds };
  });
}

/** The material's notes, from its first note to the end of its last (rests around it left out). */
export function materialRun(score: Score, material: Material): string[] {
  const events = score.measures
    .filter((m) => material.measureIds.includes(m.id))
    .flatMap((m) => barEvents(m, material.voiceId));
  const first = events.findIndex((e) => !isRest(e));
  const last = events.findLastIndex((e) => !isRest(e));
  return first === -1 ? [] : events.slice(first, last + 1).map((e) => e.id);
}

/** The material as a musician reads it: what each idea is, where, and its notes in score text. */
export function materialInWords(score: Score, materials: Material[]): string {
  return materials
    .map((m) => {
      const bars = scoreText(score, { parts: [m.handle], bars: { from: m.from, to: m.to } })
        .split("\n")
        .filter((line) => line.startsWith("bar "))
        .join("\n");
      const where = m.from === m.to ? `bar ${m.from}` : `bars ${m.from}–${m.to}`;
      return `- ${m.name} (${m.handle}, ${where})${m.about ? `: ${m.about}` : ""}\n${bars}`;
    })
    .join("\n");
}

export const motifSchema = z.strictObject({
  material: z.string().describe('The material to play, by name ("subject").'),
  bar: z.coerce.number().int().min(1).describe("The bar it starts in, in your part."),
  beat: z.coerce.number().min(1).default(1).describe("The beat it starts on, from 1 (2.5 is the and of 2)."),
  staff: z
    .string()
    .optional()
    .describe('Another of your staves or voices ("piano.2", "piano/v2"). Default: your first.'),
  steps: z.coerce
    .number()
    .int()
    .min(-21)
    .max(21)
    .optional()
    .describe(
      "Move it in the key by staff steps: 4 a fifth up (a fugal answer), -3 a fourth down, 7 an octave, -14 two down.",
    ),
  invert: z.boolean().optional().describe("Upside down: every interval mirrored."),
  retrograde: z.boolean().optional().describe("Backwards."),
  factor: z
    .union([z.literal(2), z.literal(0.5)])
    .optional()
    .describe("2 augments (twice as slow), 0.5 diminishes."),
  notes: z
    .tuple([z.number().int().min(1), z.number().int().min(1)])
    .optional()
    .describe("Only a piece of it: its notes from..to, counting from 1 (rests count), e.g. [1, 4] for its head."),
});
export type MotifRequest = z.infer<typeof motifSchema>;

/** The edit that plays material in a musician's part: a developed copy (copyNotes) at its bar and beat. */
export function motifOperation(score: Score, materials: Material[], part: string, request: MotifRequest): Operation {
  const material = materials.find((m) => m.name.toLowerCase() === request.material.trim().toLowerCase());
  if (!material) {
    throw new Error(
      `There is no material "${request.material}". The material: ${materials.map((m) => m.name).join(", ") || "none"}.`,
    );
  }
  let run = materialRun(score, material);
  if (request.notes) run = run.slice(request.notes[0] - 1, request.notes[1]);
  if (!run.length) throw new Error(`Material "${material.name}" has no notes there.`);
  const own = findPart(score, part)!;
  const [staffRef, voiceRef] = (request.staff ?? "").split("/");
  const staffIndex = staffRef?.includes(".") ? Number(staffRef.split(".")[1]) - 1 : 0;
  const staff = own.staves[staffIndex] ?? own.staves[0];
  const voice = staff.voices[voiceRef === "v2" ? 1 : 0] ?? staff.voices[0];
  const measure = score.measures[request.bar - 1];
  if (!measure) throw new Error(`There is no bar ${request.bar}.`);
  const events = barEvents(measure, voice.id);
  const onsets = eventOnsets(events);
  const beat = request.beat - 1;
  const at = events.findIndex((e, i) => onsets[i] <= beat + 1e-6 && beat < onsets[i] + soundingBeats(e) - 1e-6);
  if (at === -1) throw new Error(`Bar ${request.bar} of your part has no beat ${request.beat}.`);
  return {
    type: "copyNotes",
    eventIds: run,
    toEventId: events[at].id,
    ...(beat - onsets[at] > 1e-6 ? { offset: beat - onsets[at] } : {}),
    ...(request.steps ? { steps: request.steps } : {}),
    ...(request.invert ? { invert: true } : {}),
    ...(request.retrograde ? { retrograde: true } : {}),
    ...(request.factor ? { factor: request.factor } : {}),
  } as Operation;
}
