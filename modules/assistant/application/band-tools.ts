import type { InstrumentId } from "@/modules/score";
import { BANDLEADER, createBandBoard, type BandNote } from "./band-board";
import { listenToBand } from "./band-listen";
import { readMaterial } from "./band-material";
import { plainMaterial } from "./band-material-check";
import { createBandClock } from "./band-clock";
import { keepsCounterpoint, styleFromFeel } from "./band-styles";
import { castBand, songBand } from "./band-setup";
import { bandleaderBrief } from "./bandleader-brief";
import { firstPassWaves, rehearsalOrder } from "./musicians";
import { runMusician, type BandContext, type BandPlan, type BandRoom, type MusicianJob } from "./run-musician";
import { toolError } from "./score-tool-gateway";

export { BAND_ARRANGE, bandToolSpecs, isBandTool } from "./band-specs";
import { arrangeSchema, BAND_ARRANGE, BAND_REHEARSE, MAX_REHEARSALS, rehearseSchema } from "./band-specs";

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
    board
      .lineup()
      .map((job) => `${job.name} (${job.part}): ${reports.get(job.part)?.report ?? "as it stands in the score"}`);
  /** What the bandleader decided for the band: from the last arrangement, or the song as it stands. */
  let plan: BandPlan = { style: "pop", feel: "", form: [], materials: [] };
  /** Each arrangement this turn edits under its own request IDs, so a second try never collides with the first. */
  let arrangements = 0;
  let materialChecked = false;
  const clock = createBandClock(context.signal);
  /** The song as the turn began: its own music is never sent back as plain material. */
  const songBefore = context.score();
  const playing = () => ({ ...context, signal: clock.start() });
  const listening = () => listenToBand(context.score(), board.names(), { counterpoint: keepsCounterpoint(plan.style) });
  const wait = ({ part, instrument, name }: MusicianJob, round: number) =>
    context.onProgress({ stage: "musician", part, instrument, name, state: "waiting", round });

  /**
   * The musicians hear the band and fix their parts, all at once, each only its own: those with
   * notes waiting or named in what the band sounds like (everyone, for a problem of the whole band).
   */
  const rehearse = async (everyone = false): Promise<BandNote[]> => {
    rehearsals++;
    const before = board.said().length;
    const heard = listening();
    const together = played();
    const named = (job: MusicianJob) => heard.problems.some((problem) => problem.includes(`${job.name} (`));
    const whole = heard.problems.some((problem) => !board.lineup().some((job) => problem.includes(`${job.name} (`)));
    const band = rehearsalOrder(board.lineup()).filter(
      (job) => everyone || whole || named(job) || board.waiting(job.name),
    );
    for (const job of band) wait(job, rehearsals);
    await Promise.all(
      band.map(async (job) => {
        const round = { kind: "rehearsal" as const, round: rehearsals, listening: heard, played: together };
        const notes = board.take(job.name);
        const { report: text } = await runMusician(playing(), job, plan, { ...round, notes }, room);
        report(job, text);
      }),
    );
    heardAfter.push({ round: rehearsals, problems: listening().problems });
    return board.said().slice(before);
  };

  const arrange = async (raw: unknown): Promise<ToolResult> => {
    const parsed = arrangeSchema.parse(raw);
    arrangements++;
    const materials = readMaterial(context.score(), parsed.material ?? []);
    // Plain material is sent back once, so the piece is built on a theme worth developing.
    const plain = materialChecked ? null : plainMaterial(context.score(), materials, songBefore, parsed.style);
    materialChecked = true;
    if (plain) return { ok: false, error: plain };
    plan = { style: parsed.style, feel: parsed.feel, form: parsed.form, materials };
    const jobs = castBand({ ...context, turnId: `${context.turnId}-a${arrangements}` }, parsed);
    const ordered = rehearsalOrder(jobs);
    for (const job of ordered) board.seat(job);
    for (const job of ordered) wait(job, 0);
    // The first pass, against the clock: the groove, then everyone else at once (they share the
    // form, the material and the tune plan; the rehearsal fits them together).
    const before: string[] = [];
    for (const wave of firstPassWaves(ordered)) {
      const heard = [...before];
      const played = await Promise.all(
        wave.map(async (job) => {
          const round = { kind: "first" as const, before: heard, notes: board.take(job.name) };
          const { report: text } = await runMusician(playing(), job, plan, round, room);
          report(job, text);
          return `${job.name} (${job.part}): ${text}`;
        }),
      );
      before.push(...played);
    }
    heardAfter.push({ round: 0, problems: listening().problems });
    // The band always rehearses once (it is where they hear each other and talk), everyone in it;
    // the bandleader may ask for another round while there is time.
    if (rehearsals < MAX_REHEARSALS) await rehearse(true);
    return {
      ok: true,
      played: played(),
      talked: board.said().map(spoken),
      // With time for another round, what it sounds like; without, only what is needed to reply.
      ...(clock.roomForRehearsal()
        ? {
            sounds: listening(),
            next: "If what it sounds like has a problem worth another round, band_rehearse with your notes; else finish.",
          }
        : { next: "The band's time is up: reply now (your plan is marked done)." }),
    };
  };

  const again = async (raw: unknown): Promise<ToolResult> => {
    const parsed = rehearseSchema.parse(raw);
    const { notes } = parsed;
    // A later turn: the band in the song takes the composer's comments, as the bandleader passes them on.
    if (!board.lineup().length) {
      if (!notes.length) return { ok: false, error: "Tell the musicians what to change: notes to them by name." };
      for (const job of songBand(context.score())) board.seat(job);
      const feel = parsed.feel ?? "As the song stands: keep its style and feel.";
      plan = { ...plan, feel, style: parsed.style ?? styleFromFeel(feel) };
    }
    if (!clock.roomForRehearsal() && board.lineup().length && rehearsals > 0)
      return { ok: false, error: "The band's time is up: reply now with what it plays." };
    if (rehearsals >= MAX_REHEARSALS)
      return { ok: false, error: `The band has rehearsed ${rehearsals} times: reply now.` };
    // Another round is for something left to fix: what the band still sounds like, or the bandleader's notes.
    if (!notes.length && !listening().problems.length) {
      return { ok: false, error: "The band sounds right and you sent no notes: nothing to rehearse. Reply now." };
    }
    for (const { to, note } of notes) {
      const refused = board.say(BANDLEADER, to, note);
      if (refused) return { ok: false, error: refused };
    }
    const talked = await rehearse();
    return { ok: true, played: played(), talked: talked.map(spoken), sounds: listening() };
  };

  return {
    /** What the bandleader reads about Band Mode and the band already in the song. */
    lead: () => bandleaderBrief(context.score()),
    /** Whether the band has played this turn: then its plan is done, whatever steps it still shows. */
    played: () => reports.size > 0,
    /** Whether the band has played and its time is up: all that is left is the reply. */
    finished: () => reports.size > 0 && !clock.roomForRehearsal(),
    /** For the turn's result: what each played last, what they said, and what was heard after each pass. */
    result: () => {
      clock.stop();
      return {
        ...(reports.size ? { band: [...reports.values()] } : {}),
        ...(board.said().length ? { bandNotes: board.said() } : {}),
        ...(heardAfter.length ? { bandRounds: heardAfter } : {}),
      };
    },
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
