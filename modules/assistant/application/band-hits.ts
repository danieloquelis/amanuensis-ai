import {
  barEvents,
  CHORD_QUALITIES,
  eventOnsets,
  eventPitches,
  midiPitch,
  pitchClass,
  staffHandle,
  type Part,
  type Score,
} from "@/modules/score";

/** One attack of a line: where it starts (bar from 0, beat from 0) and what sounds. */
export type Hit = { bar: number; beat: number; midi: number[]; drums: string[] };

/** A line of the band: a staff of a part, with its attacks (held notes are not attacks). */
export type Line = { handle: string; part: Part; hits: Hit[] };

/** A chord in effect from a bar and beat on: its notes as pitch classes, and its root. */
type Harmony = { bar: number; beat: number; tones: Set<number>; root: number };

const ON_BEAT = 1e-6;
export const onBeat = (beat: number) => Math.abs(beat - Math.round(beat)) < ON_BEAT;

/** Every staff of the score as a line, with its attacks in all its voices. */
export function bandLines(score: Score): Line[] {
  return score.parts.flatMap((part) =>
    part.staves.map((staff) => {
      const hits: Hit[] = [];
      for (const voice of staff.voices) {
        let held: number[] = [];
        score.measures.forEach((measure, bar) => {
          const events = barEvents(measure, voice.id);
          const onsets = eventOnsets(events);
          events.forEach((event, i) => {
            const midi = eventPitches(event).map(midiPitch);
            const continued = midi.length > 0 && midi.every((m) => held.includes(m));
            held = event.tie ? midi : [];
            if (continued) return;
            if (midi.length || event.drums?.length) {
              hits.push({ bar, beat: onsets[i], midi, drums: [...(event.drums ?? [])] });
            }
          });
        });
      }
      hits.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
      return { handle: staffHandle(score, staff.id) ?? part.id, part, hits };
    }),
  );
}

/** The song's chords, in order, as the notes each one allows. */
export function harmonies(score: Score): Harmony[] {
  const bars = new Map(score.measures.map((measure, i) => [measure.id, i]));
  return score.chords
    .flatMap((chord) => {
      const bar = bars.get(chord.measureId);
      if (bar === undefined) return [];
      const root = pitchClass(chord.root);
      const tones = new Set<number>(CHORD_QUALITIES[chord.quality].map((interval: number) => (root + interval) % 12));
      if (chord.bass) tones.add(pitchClass(chord.bass));
      return [{ bar, beat: chord.beat, tones, root }];
    })
    .sort((a, b) => a.bar - b.bar || a.beat - b.beat);
}

/** The chord sounding at a bar and beat: the last one that started at or before it. */
export function chordAt(chords: Harmony[], bar: number, beat: number): Harmony | null {
  let found: Harmony | null = null;
  for (const chord of chords) {
    if (chord.bar > bar || (chord.bar === bar && chord.beat > beat + ON_BEAT)) break;
    found = chord;
  }
  return found;
}

/** Bar numbers (from 0) as a musician reads them, runs joined: "2–5, 9". */
export function barList(bars: number[]): string {
  const sorted = [...new Set(bars)].sort((a, b) => a - b).map((bar) => bar + 1);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    runs.push(start === sorted[i] ? `${start}` : `${start}–${sorted[i]}`);
  }
  return runs.join(", ");
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
