import { groovesFor, SCORE_TEXT_GUIDE, type InstrumentId, type Score } from "@/modules/score";
import { z } from "zod";
import type { Listening } from "./band-listen";
import type { KeptBar } from "./tune-line";
import type { ToolSpec } from "./model-port";
import { craftCard } from "./musicians";
import { toolParameters } from "./tool-definitions";

/** One part to play: its handle, instrument, the musician's name and the bandleader's brief. */
export type MusicianJob = {
  part: string;
  instrument: InstrumentId;
  name: string;
  brief: string;
  /** The tune's bars this musician carries as planned: it may phrase them, not change their notes. */
  kept?: KeptBar[];
};

/**
 * Which pass a musician is on: the first time through (hearing those who played before), or a
 * rehearsal round, where it hears the whole band, what it sounds like together and the notes its
 * bandmates (or the bandleader) sent it.
 */
export type MusicianRound =
  | { kind: "first"; before: string[]; notes: string[] }
  | { kind: "rehearsal"; round: number; listening: Listening; played: string[]; notes: string[] };

export const BAND_NOTE = "band_note";

export const noteSchema = z.strictObject({
  to: z.string().trim().min(1).max(40).describe('The bandmate it is for, by name ("Rumble"), or "band" for everyone.'),
  note: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe("One concrete sentence a musician would say: what, where (bars) and why."),
});

export const bandNoteSpec: ToolSpec = {
  name: BAND_NOTE,
  description:
    'Say something to a bandmate about how your parts fit: they read it before they next play ("Rumble, land with my kick on 1 and the and of 3 in bars 1–8"). Only for something they should change or know.',
  parameters: toolParameters(noteSchema),
};

export const MUSICIAN_PROMPT = `You are one musician in the band of Amanuensis, a music notation editor, playing your own part of an arrangement the bandleader asked for. A band listens to each other: you hear what the others play, tell them what gets in your way, and change your own part for the band.

How to work:
- Write only your part, in its staves (score_write lines name them, "bar 3 bass: …"; score_edit takes voiceId or staffId). Everything else is the bandleader's: chords, marks, key, meter, tempo, other parts.
- Your part may already hold music (a lead sheet's melody on the piano): keep it unless your brief says to replace it, and put yours beside it, on a second staff (setStaffCount, then "bar N piano.2: …") or a second voice ("bar N piano v2: …").
- Play like a musician, not a loop: shape the part over the song (build into sections, vary the figure, leave space, mark the endings of phrases).
- Fit the band: follow the chords, the feel in the brief and what the others play (lock with the drums' kick, stay out of the melody's register, leave room where another part speaks).
- Write in one score_write call (every bar you are writing, all your staves). Its reply shows your part as it now stands: check it there and fix what is off, without reading the score again.
- When something in a bandmate's part gets in your way, tell them with band_note: by name, one concrete sentence with the bars.
- Then reply to the bandleader in one or two short sentences: what you played and why, as a musician would say it.

${SCORE_TEXT_GUIDE}`;

const list = (lines: string[]) => lines.map((line) => `- ${line}`).join("\n");
/** The grooves putGroove has for the song's meter, for the drummer to start from. */
const grooves = (score: Score) => groovesFor(score.measures[0].meter).join(", ") || "none: write it by hand";

/** The musician's own instructions: how the band works, and its instrument's craft. */
export const musicianSystem = (job: MusicianJob) => `${MUSICIAN_PROMPT}\n\n${craftCard(job.instrument, job.name)}`;

/** What a musician reads before it plays: the feel, its part, the band so far and the score. */
export function musicianBrief(
  job: MusicianJob,
  feel: string,
  round: MusicianRound,
  extra: { score: Score; scoreText: string; bandmates: string[]; memory?: string[] },
): string {
  const notes = round.notes.length ? [`Notes for you:\n${list(round.notes)}`] : [];
  const shared = [
    `The band's feel: ${feel}`,
    `Your part (${job.part}): ${job.brief}`,
    `Your bandmates: ${extra.bandmates.join(", ") || "none: you play alone"}.`,
    ...(job.instrument === "drums" ? [`Grooves for this meter: ${grooves(extra.score)}.`] : []),
    ...(extra.memory?.length ? [`What you know about the musician and their band:\n${list(extra.memory)}`] : []),
  ];
  const now =
    round.kind === "first"
      ? [
          round.before.length
            ? `What the others played before you:\n${list(round.before)}`
            : "You play first: the others will play to you.",
          ...notes,
        ]
      : [
          `Rehearsal, round ${round.round}: the whole band has played. What each said they played:\n${list(round.played)}`,
          `What the band sounds like together:\n${list(round.listening.lines)}`,
          `What a listener hears that could be better:\n${round.listening.problems.length ? list(round.listening.problems) : "- nothing stands out"}`,
          ...notes,
          "Now, as a band: change your own part where the band needs it (only the bars that need it, in one score_write), tell a bandmate with band_note when their part is in your way, and reply in one sentence: what you changed and why, or why yours stays as it is.",
        ];
  return [...shared, ...now, `[Score context, as score_get_context returns it]\n${extra.scoreText}`].join("\n\n");
}
