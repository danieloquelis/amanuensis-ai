import { groovesFor, SCORE_TEXT_GUIDE, type InstrumentId, type Score } from "@/modules/score";
import { z } from "zod";
import type { Listening } from "./band-listen";
import type { KeptBar } from "./tune-line";
import type { ToolSpec } from "./model-port";
import { materialInWords, type Material } from "./band-material";
import { styleIdiom, type Style } from "./band-styles";
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

export const MUSICIAN_PROMPT = `You are one musician in the band of Amanuensis, a music notation editor, playing your own part of a piece the bandleader composed and arranged. You write like a professional in the style, not a student: every bar has a reason. A band listens to each other: you hear what the others play, tell them what gets in your way, and change your own part for the band. Some bandmates play their first pass at the same time as you; you hear them in the rehearsal.

How a professional writes a part:
- Grow it from the band's material: quote it, answer it, develop it (moved to another degree, inverted, augmented, in fragments, in sequence). band_motif places it exactly in your part; then write around it. Never fill bars with ideas unrelated to the material, the harmony or another part.
- Give each line a shape: a direction and one high point per phrase, mostly steps with a few leaps (a leap is answered by a step back the other way). Scales running up and down are not a line; neither is noodling.
- Give it a rhythm of its own and vary it: eighths, dotted figures, syncopations and rests as well as long notes (a part of only quarters and halves plods); move while the others hold, hold while they move.
- After the material's first statement, develop it rather than repeat it: the same bars note for note a third time is copying.
- Strong beats on chord tones (or consonances with the other voices); dissonances pass by step, lean and resolve.
- Phrase in 2, 4 and 8 bars, ending on cadences; follow the form: where your part rests, enters, builds, peaks and falls back. Not everyone plays all the time.
- Mark the dynamics the form asks for, and shape phrases with cresc. and dim.

How to work:
- Write only your part, in its staves (score_write lines name them, "bar 3 bass: …"; score_edit takes voiceId or staffId). Everything else is the bandleader's: chords, marks, key, meter, tempo, other parts.
- Your part may already hold music (a lead sheet's melody on the piano): keep it unless your brief says to replace it, and put yours beside it, on a second staff (setStaffCount, then "bar N piano.2: …") or a second voice ("bar N piano v2: …").
- Play like a musician, not a loop: shape the part over the song (build into sections, vary the figure, leave space, mark the endings of phrases).
- Fit the band: follow the chords, the feel in the brief and what the others play (lock with the drums' kick, stay out of the melody's register, leave room where another part speaks).
- Dynamics and directions are putAnnotation, exactly like { "type": "putAnnotation", "kind": "dynamic", "text": "mp", "targetId": "bass/2#1" } (kind "dynamic" or "text"; targetId one of your notes by part and position); score_write cannot set them, and its ";" fields are the bandleader's. Mark only where they shape the music, all of them in one score_edit batch ({ "type": "batch", "operations": [...] }) sent in the same reply as your score_write (the calls run in order): one round trip, not one per mark. Every score_edit names your part (voiceId or staffId, or "part/bar#n" in note positions).
- Play your whole part in one reply, all its calls together (they run in order): band_motif for the material, one score_write for every bar you write (all your staves), then one score_edit batch for the dynamics. The band plays against the clock: you have few replies. The write's reply shows your part as it now stands: fix only what is off, then report.
- When something in a bandmate's part gets in your way, tell them with band_note: by name, one concrete sentence with the bars.
- Then reply to the bandleader in one or two short sentences: what you played and why, as a musician would say it.

${SCORE_TEXT_GUIDE}`;

const list = (lines: string[]) => lines.map((line) => `- ${line}`).join("\n");
/** The grooves putGroove has for the song's meter, for the drummer to start from. */
const grooves = (score: Score) => groovesFor(score.measures[0].meter).join(", ") || "none: write it by hand";

/** The musician's own instructions: how the band works, and its instrument's craft. */
export const musicianSystem = (job: MusicianJob) => `${MUSICIAN_PROMPT}\n\n${craftCard(job.instrument, job.name)}`;

/** What the bandleader decided for the whole band: the style, the feel, the form and the material. */
export type BandPlan = { style: Style; feel: string; form: FormSection[]; materials: Material[] };
type FormSection = { from: number; to: number; name: string; plan: string };

const formInWords = (form: FormSection[]) => list(form.map((s) => `bars ${s.from}–${s.to}, ${s.name}: ${s.plan}`));

/** What a musician reads before it plays: the plan, its part, the band so far and the score. */
export function musicianBrief(
  job: MusicianJob,
  plan: BandPlan,
  round: MusicianRound,
  extra: { score: Score; scoreText: string; bandmates: string[]; memory?: string[] },
): string {
  const notes = round.notes.length ? [`Notes for you:\n${list(round.notes)}`] : [];
  const shared = [
    `The style: ${styleIdiom(plan.style)}`,
    `The band's feel: ${plan.feel}`,
    ...(plan.form.length ? [`The form:\n${formInWords(plan.form)}`] : []),
    ...(plan.materials.length
      ? [`The material (band_motif plays it in your part):\n${materialInWords(extra.score, plan.materials)}`]
      : []),
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
          "Now, as a band, in one reply of calls: do what the Bandleader's notes ask (they carry the composer's wishes, even when that is a lot of change), change your own part where the band needs it (only the bars that need it, in one score_write), and speak to your bandmates with band_note: tell the one your part depends on what you need from them (by name, with the bars), or answer a note you got. Then reply in one sentence: what you changed and why, or why yours stays as it is.",
        ];
  return [...shared, ...now, `[Score context, as score_get_context returns it]\n${extra.scoreText}`].join("\n\n");
}
