import { barEvents, DYNAMICS, isDrumKit, type Score } from "@/modules/score";
import { barList } from "./band-hits";
import { melodic, voiceLines, type VoiceLine } from "./band-voices";

// What a piece is built from and how it is shaped: figures that come back, the dynamic arc, the
// texture, and the clashes that hang on the beat.

/** Four notes are a figure a listener recognises when it comes back. */
const FIGURE = 4;

/** A figure as its intervals and rhythm, at any pitch: "+2 +2 -4 | 1 1 2" (lengths as shares of the first). */
function figureKey(intervals: number[], lengths: number[]): string {
  return `${intervals.join(" ")}|${lengths.map((l) => (l / lengths[0]).toFixed(2)).join(" ")}`;
}

/** A figure that is only a scale fragment or one repeated note says nothing when it returns. */
function plain(intervals: number[]): boolean {
  if (intervals.every((i) => i === 0)) return true;
  const steps = intervals.every((i) => Math.abs(i) >= 1 && Math.abs(i) <= 2);
  return steps && intervals.every((i) => Math.sign(i) === Math.sign(intervals[0]));
}

/**
 * How much of the music comes back: the share of four-note figures (at any pitch, or upside
 * down, by their rhythm) heard more than once. Coherent pieces are built from a few figures;
 * noodling and filler rarely repeat one.
 */
export function motivicUnity(lines: VoiceLine[]): number {
  const figures: string[][] = lines.map((line) => {
    const keys: string[] = [];
    for (let i = 0; i + FIGURE <= line.notes.length; i++) {
      const notes = line.notes.slice(i, i + FIGURE);
      const intervals = notes.slice(1).map((note, k) => melodic(note) - melodic(notes[k]));
      if (plain(intervals)) continue;
      const lengths = notes.slice(0, -1).map((note, k) => notes[k + 1].start - note.start);
      keys.push(
        figureKey(intervals, lengths),
        figureKey(
          intervals.map((x) => -x),
          lengths,
        ),
      );
    }
    return keys;
  });
  const count = new Map<string, number>();
  for (const keys of figures)
    for (let i = 0; i < keys.length; i += 2) count.set(keys[i], (count.get(keys[i]) ?? 0) + 1);
  let total = 0;
  let heardAgain = 0;
  for (const keys of figures)
    for (let i = 0; i < keys.length; i += 2) {
      total++;
      if ((count.get(keys[i]) ?? 0) > 1 || (count.get(keys[i + 1]) ?? 0) > 0) heardAgain++;
    }
  return total ? heardAgain / total : 0;
}

/** The dynamic levels marked anywhere, and the swells and fades written out (cresc., dim.). */
export function dynamicShape(score: Score): { levels: string[]; swells: number } {
  const levels = new Set<string>();
  let swells = 0;
  for (const annotation of score.annotations) {
    if (annotation.kind === "dynamic" && (DYNAMICS as readonly string[]).includes(annotation.text))
      levels.add(annotation.text);
    if (/cresc|dim\b|dim\.|decresc|swell/i.test(annotation.text)) swells++;
  }
  return { levels: [...levels], swells };
}

/** How much of the song the whole band plays at once, and how many different groupings it uses. */
export function texture(score: Score): { tutti: number; groupings: number; bars: number } {
  const playing = score.measures.map((measure) =>
    score.parts
      .filter((part) =>
        part.staves.some((staff) =>
          staff.voices.some((voice) =>
            barEvents(measure, voice.id).some((e) => e.pitch || (isDrumKit(part.instrument) && e.drums?.length)),
          ),
        ),
      )
      .map((part) => part.id)
      .join(","),
  );
  const busy = playing.filter(Boolean);
  const tutti = busy.filter((group) => group.split(",").length === score.parts.length).length;
  return { tutti: busy.length ? tutti / busy.length : 0, groupings: new Set(busy).size, bars: busy.length };
}

const SECOND = new Set([1, 11]);
/** Clashes are judged between notes that both last at least a beat: passing tones are fine. */
const HELD = 1;

/** Moments on the beat where two parts hold a minor second (or major seventh) against each other. */
export function heldClashes(score: Score): { share: number; bars: string } {
  const lines = voiceLines(score);
  const moments = new Map<number, { midi: number; part: string; bar: number }[]>();
  for (const line of lines)
    for (const note of line.notes) {
      if (note.end - note.start < HELD || Math.abs(note.beat - Math.round(note.beat)) > 1e-6) continue;
      const at = moments.get(note.start) ?? [];
      for (const midi of note.midi) at.push({ midi, part: line.part.id, bar: note.bar });
      moments.set(note.start, at);
    }
  let checked = 0;
  const clashing: number[] = [];
  for (const notes of moments.values()) {
    if (new Set(notes.map((n) => n.part)).size < 2) continue;
    checked++;
    const clash = notes.some((a, i) =>
      notes.slice(i + 1).some((b) => a.part !== b.part && SECOND.has((((a.midi - b.midi) % 12) + 12) % 12)),
    );
    if (clash) clashing.push(notes[0].bar);
  }
  return { share: checked ? clashing.length / checked : 0, bars: barList(clashing) };
}
