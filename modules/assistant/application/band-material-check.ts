import { barEvents, eventPitches, midiPitch, soundingBeats, type Score } from "@/modules/score";
import type { Material } from "./band-material";
import type { Style } from "./band-styles";
import { barNotes } from "./tune-line";

// Is the material worth building a piece on? A theme a listener remembers has a rhythm of its own,
// a shape with a leap or a turn, and is not just a scale: everything the band plays grows from it.

/** Material shorter than this is a cell (a riff, a figure); it is judged by the band's ear instead. */
const THEME_NOTES = 5;
/** A run of this many notes stepping one way is a scale fragment. */
const SCALE_RUN = 5;
/** A theme this much made of scale runs is a scale with a different ending. */
const SCALE_SHARE = 0.6;
const STEP = 2;

/** The material's notes in order: pitch (its top note) and length in beats; tied notes join. */
function themeNotes(score: Score, material: Material): { midi: number; beats: number }[] {
  const notes: { midi: number; beats: number }[] = [];
  let tied = false;
  for (const measure of score.measures.filter((m) => material.measureIds.includes(m.id)))
    for (const event of barEvents(measure, material.voiceId)) {
      const pitches = eventPitches(event).map(midiPitch);
      if (pitches.length && tied) notes.at(-1)!.beats += soundingBeats(event);
      else if (pitches.length) notes.push({ midi: Math.max(...pitches), beats: soundingBeats(event) });
      tied = Boolean(event.tie) && pitches.length > 0;
    }
  return notes;
}

/** The share of the notes inside runs stepping one way. */
function scaleShare(pitches: number[]): number {
  const inRun = new Set<number>();
  let from = 0;
  for (let i = 1; i <= pitches.length; i++) {
    const step = pitches[i] - pitches[i - 1];
    const direction = Math.sign(pitches[from + 1] - pitches[from]);
    const continues =
      i < pitches.length && Math.abs(step) >= 1 && Math.abs(step) <= STEP && Math.sign(step) === direction;
    if (continues) continue;
    if (i - from >= SCALE_RUN) for (let k = from; k < i; k++) inRun.add(k);
    from = i - 1;
  }
  return pitches.length ? inRun.size / pitches.length : 0;
}

/** What keeps a theme from being characteristic, in a composer's words; empty when it is. */
export function materialFaults(score: Score, material: Material, longNotesFit = false): string[] {
  const notes = themeNotes(score, material);
  if (notes.length < THEME_NOTES) return [];
  const pitches = notes.map((note) => note.midi);
  const faults: string[] = [];
  if (scaleShare(pitches) >= SCALE_SHARE) faults.push("it is mostly a scale");
  const leaps = pitches.slice(1).some((midi, i) => Math.abs(midi - pitches[i]) > STEP);
  if (!leaps) faults.push("it moves only by step, with no leap");
  if (new Set(notes.map((note) => note.beats.toFixed(3))).size <= 1) faults.push("every note is the same length");
  else if (!longNotesFit && notes.every((note) => note.beats >= 1))
    faults.push("no note is shorter than a beat, so it has no rhythmic life");
  return faults;
}

/** Whether the material is music the song already had before this turn (theirs: never sent back). */
const theirs = (before: Score, now: Score, material: Material) =>
  material.measureIds.every((id) => {
    const then = before.measures.find((m) => m.id === id);
    const current = now.measures.find((m) => m.id === id);
    return then && current && barNotes(then, material.voiceId) === barNotes(current, material.voiceId);
  });

/**
 * Why the material the bandleader composed should be rewritten before the band plays, or null
 * when it is ready. Music the song already had (`before`, the score as the turn began) is theirs,
 * and is never judged.
 */
export function plainMaterial(score: Score, materials: Material[], before: Score, style: Style): string | null {
  // A ballad head or a film lament may sing in long notes.
  const longNotesFit = style === "cinematic" || style === "jazz";
  const faults = materials
    .filter((m) => !theirs(before, score, m))
    .map((m) => ({ m, faults: materialFaults(score, m, longNotesFit) }))
    .filter(({ faults }) => faults.length)
    .map(({ m, faults }) => `${m.name} (${m.handle}, bars ${m.from}–${m.to}): ${faults.join("; ")}`);
  if (!faults.length) return null;
  return `Before the band plays, make the material worth building on: ${faults.join(". ")}. A theme a listener remembers has a rhythm of its own (dotted notes, a run against long notes, a rest), a shape with one high point, and a telling leap or turn. Rewrite it with score_write, then band_arrange again.`;
}
