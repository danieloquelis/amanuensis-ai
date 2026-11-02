import { z } from "zod";
import { INSTRUMENT_IDS, type InstrumentId } from "@/modules/score";
import { BANDLEADER, createBandBoard, type BandNote } from "./band-board";
import { listenToBand } from "./band-listen";
import { keepMelody, resolvePart } from "./band-setup";
import type { ToolSpec } from "./model-port";
import { noteSchema } from "./musician-brief";
import { musicianName, rehearsalOrder, roleOf } from "./musicians";
import { runMusician, type BandContext, type BandRoom, type MusicianJob } from "./run-musician";
import { toolError } from "./score-tool-gateway";
import { toolParameters } from "./tool-definitions";

export const BAND_ARRANGE = "band_arrange";
const BAND_LISTEN = "band_listen";
const BAND_REHEARSE = "band_rehearse";
/** Rehearsal rounds a turn may have: the one after the band first plays, and one more. */
const MAX_REHEARSALS = 2;

const arrangeSchema = z.strictObject({
  feel: z.string().trim().min(1).max(300).describe("The style and feel the whole band plays in, and the passage."),
  parts: z
    .array(
      z.strictObject({
        part: z
          .string()
          .describe(
            'An existing part\'s handle ("piano", "bass"), or an instrument to add. List the parts already in the song too when the new ones change what they should play.',
          ),
        brief: z.string().trim().min(1).max(400).describe("What this musician should play, in a musician's words."),
      }),
    )
    .min(1)
    .max(8),
});

const rehearseSchema = z.strictObject({
  notes: z.array(noteSchema).max(8).default([]).describe("Your notes to musicians, by name, for this round."),
});

export const bandToolSpecs: ToolSpec[] = [
  {
    name: BAND_ARRANGE,
    description: `Have the band play an arrangement: each part is played by its own musician, in rehearsal order (drums, bass, harmony, then lead lines), each hearing those before it; then the band rehearses once: every musician hears the whole band, reads the notes the others sent it and fixes its own part. Missing parts are added. Returns what each played, what they said to each other and what the band sounds like now. Instruments: ${INSTRUMENT_IDS.join(", ")}.`,
    parameters: toolParameters(arrangeSchema),
  },
  {
    name: BAND_LISTEN,
    description:
      "Listen to the band as it stands: each part in a line, and what could be better (clashes with the chords, a part looping one bar, the bass missing the kick, two parts in one register, notes out of range, silence where the others play).",
    parameters: toolParameters(z.strictObject({})),
  },
  {
    name: BAND_REHEARSE,
    description: `Another rehearsal round, with your notes to musicians by name: they all hear the band, read your notes and theirs, and fix their parts. For problems that matter (at most ${MAX_REHEARSALS} rounds a turn, the one band_arrange runs included).`,
    parameters: toolParameters(rehearseSchema),
  },
];

const BAND_TOOLS = new Set([BAND_ARRANGE, BAND_LISTEN, BAND_REHEARSE]);
export const isBandTool = (name: string) => BAND_TOOLS.has(name);

/** What a musician told the bandleader, kept for the turn's result. */
export type BandReport = { part: string; instrument: InstrumentId; name: string; report: string };
/** What the band's listening heard after a pass: 0 the first time through, then each rehearsal. */
export type BandRound = { round: number; problems: string[] };

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
const spoken = (note: BandNote) => `${note.from} → ${note.to}: ${note.note}`;

/**
 * The band, for one turn, on the turn's own edits (one undo step): `band_arrange` seats the
 * musicians and plays the arrangement through once, in rehearsal order, then rehearses;
 * `band_rehearse` runs another round with the bandleader's notes; `band_listen` hears it.
 */
export function createBandTools(context: BandContext) {
  const board = createBandBoard(context.onProgress);
  const reports = new Map<string, BandReport>();
  /** What the band sounded like after each pass (0 the first time through), for the turn's result. */
  const heardAfter: BandRound[] = [];
  let rehearsals = 0;
  const room: BandRoom = {
    get bandmates() {
      return board.lineup().map((job) => job.name);
    },
    say: (from, to, note) => board.say(from.name, to, note),
  };
  const report = (job: MusicianJob, text: string) => reports.set(job.part, { ...job, report: text });
  const played = () =>
    board.lineup().map((job) => `${job.name} (${job.part}): ${reports.get(job.part)?.report ?? "—"}`);
  const listening = () => listenToBand(context.score(), board.names());
  /** The feel the band plays in, from the last arrangement. */
  let feel = "";
  const wait = ({ part, instrument, name }: MusicianJob, round: number) =>
    context.onProgress({ stage: "musician", part, instrument, name, state: "waiting", round });

  /** Every musician hears the band and fixes its part, all at once: each writes only its own part. */
  const rehearse = async (): Promise<BandNote[]> => {
    rehearsals++;
    const before = board.said().length;
    const heard = listening();
    const together = played();
    const band = rehearsalOrder(board.lineup());
    for (const job of band) wait(job, rehearsals);
    await Promise.all(
      band.map(async (job) => {
        const round = { kind: "rehearsal" as const, round: rehearsals, listening: heard, played: together };
        const { report: text } = await runMusician(context, job, feel, { ...round, notes: board.take(job.name) }, room);
        report(job, text);
      }),
    );
    heardAfter.push({ round: rehearsals, problems: listening().problems });
    return board.said().slice(before);
  };

  const arrange = async (raw: unknown): Promise<ToolResult> => {
    const parsed = arrangeSchema.parse(raw);
    feel = parsed.feel;
    let melodyOn: string | null = null;
    const jobs: MusicianJob[] = parsed.parts.map(({ part, brief }) => {
      const resolved = resolvePart(context, part);
      const kept = keepMelody(context, resolved.part, resolved.instrument);
      if (kept) melodyOn = resolved.part;
      const name = musicianName(resolved.instrument, resolved.part);
      return { ...resolved, name, brief: kept ? `${brief} ${kept}` : brief };
    });
    // The tune already sounds on the piano: a lead line answers it rather than doubling it.
    for (const job of jobs) {
      if (melodyOn && job.part !== melodyOn && roleOf(job.instrument) === "lead") {
        job.brief += ` The song's melody is already played by ${melodyOn}: don't double it note for note; answer it, harmonise it or play a countermelody, unless your brief says you take the melody.`;
      }
    }
    const ordered = rehearsalOrder(jobs);
    for (const job of ordered) board.seat(job);
    for (const job of ordered) wait(job, 0);
    const before: string[] = [];
    for (const job of ordered) {
      const round = { kind: "first" as const, before: [...before], notes: board.take(job.name) };
      const { report: text } = await runMusician(context, job, feel, round, room);
      before.push(`${job.name} (${job.part}): ${text}`);
      report(job, text);
    }
    heardAfter.push({ round: 0, problems: listening().problems });
    if (rehearsals < MAX_REHEARSALS) await rehearse();
    return {
      ok: true,
      played: played(),
      talked: board.said().map(spoken),
      sounds: listening(),
      next: "If what it sounds like has a problem worth another round, band_rehearse with your notes; else reply.",
    };
  };

  const again = async (raw: unknown): Promise<ToolResult> => {
    const { notes } = rehearseSchema.parse(raw);
    if (!board.lineup().length) return { ok: false, error: "The band has not played yet: band_arrange first." };
    if (rehearsals >= MAX_REHEARSALS)
      return { ok: false, error: `The band has rehearsed ${rehearsals} times: reply now.` };
    for (const { to, note } of notes) {
      const refused = board.say(BANDLEADER, to, note);
      if (refused) return { ok: false, error: refused };
    }
    const talked = await rehearse();
    return { ok: true, played: played(), talked: talked.map(spoken), sounds: listening() };
  };

  return {
    /** For the turn's result: what each played last, what they said, and what was heard after each pass. */
    result: () => ({
      ...(reports.size ? { band: [...reports.values()] } : {}),
      ...(board.said().length ? { bandNotes: board.said() } : {}),
      ...(heardAfter.length ? { bandRounds: heardAfter } : {}),
    }),
    async run(name: string, raw: unknown): Promise<ToolResult> {
      try {
        if (name === BAND_ARRANGE) return await arrange(raw);
        if (name === BAND_REHEARSE) return await again(raw);
        return { ok: true, ...listening() };
      } catch (error) {
        return { ok: false, error: toolError(error) };
      }
    },
  };
}

/** What the bandleader reads in its context when Band Mode is on. */
export const BAND_CONTEXT =
  "Band Mode is on: you lead the band. For music several parts play, put the band together yourself (the parts it needs, the ones already in the song too) and hand out the parts with band_arrange.";
