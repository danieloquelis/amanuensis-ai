// What the band evaluation measures on an arranged score, without a model: parts present and filled,
// notes out of range, comping above the melody, the bass's roots on beat 1, the drums' two voices,
// and whether the song's melody is still there. Pitches are stored as they sound.
import {
  barEvents,
  isDrumKit,
  isPlayable,
  midiPitch,
  pitchClass,
  type Chord,
  type InstrumentId,
  type Score,
  type ScoreEvent,
} from "@/modules/score";

export const BAND: InstrumentId[] = ["drums", "bass", "piano", "trumpet"];
const COMPING: InstrumentId[] = ["piano", "guitar"];
const OCTAVE = 12;

type Line = { partId: string; instrument: InstrumentId; voiceId: string };

export type Measures = {
  /** Requested parts that exist, of 4. */
  parts: number;
  /** Part-bars with notes, of 4 × the song's bars. */
  filled: number;
  filledOf: number;
  outOfRange: number;
  /**
   * Bars where the piano or guitar comping's top note is above the melody's lowest note (on any
   * line that plays the melody as single notes), of the melody bars that have both.
   */
  crowded: number;
  crowdedOf: number;
  /** Bars whose bass starts on the chord's root (or its slash bass), of the bars with a chord. */
  roots: number;
  rootsOf: number;
  /** Bars where the drums play in both hands and feet, of the song's bars. */
  drumBars: number;
  /** Bars whose melody is still on some voice, same pitches (octave aside), of the melody bars. */
  melodyKept: number;
  melodyOf: number;
};

const lines = (score: Score): Line[] =>
  score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.voices.map((voice) => ({ partId: part.id, instrument: part.instrument, voiceId: voice.id })),
    ),
  );

/** Every sounding pitch of an event (its stack too), as MIDI numbers. */
const pitches = (event: ScoreEvent) => (event.pitch ? [event.pitch, ...(event.stack ?? [])].map(midiPitch) : []);
const sounds = (event: ScoreEvent) => Boolean(event.pitch || event.drums?.length);

/** The song's melody: its first voice, and that voice's pitch classes bar by bar, in order. */
export type Melody = { voiceId: string; bars: number[][] };

export function melodyOf(score: Score): Melody {
  const voiceId = score.parts[0].staves[0].voices[0].id;
  const bars = score.measures.map((measure) =>
    barEvents(measure, voiceId)
      .filter((event) => event.pitch)
      .map((event) => midiPitch(event.pitch!) % OCTAVE),
  );
  return { voiceId, bars };
}

/**
 * Whether a voice's bar plays the melody's pitch classes in order, as the top note of each event
 * (other notes may come between, and a held note may be split into tied ones).
 */
function holds(events: ScoreEvent[], melody: number[]): boolean {
  let next = 0;
  for (const event of events) {
    const top = Math.max(...pitches(event));
    if (next < melody.length && top % OCTAVE === melody[next]) next++;
  }
  return melody.length > 0 && next === melody.length;
}

/** The chord sounding at the start of bar `index`: the last one at or before it. */
function chordAt(score: Score, index: number): Chord | undefined {
  const order = new Map(score.measures.map((m, i) => [m.id, i]));
  return score.chords
    .filter((chord) => {
      const at = order.get(chord.measureId) ?? Infinity;
      return at < index || (at === index && chord.beat === 0);
    })
    .sort((a, b) => order.get(a.measureId)! - order.get(b.measureId)! || a.beat - b.beat)
    .at(-1);
}

/** Melody bars some voice holds when the song's bars start at bar `start` of the arranged score. */
const heldFrom = (after: Score, melody: number[][], start: number) =>
  melody.filter((notes, i) =>
    lines(after).some((line) => holds(barEvents(after.measures[start + i], line.voiceId), notes)),
  ).length;

/**
 * Where the song's bars are in the arranged score: the bar offset where most of its melody is,
 * the earliest on a tie (0 unless an intro was added before the tune).
 */
function songStart(after: Score, melody: number[][]): number {
  let best = 0;
  for (let start = 1; start + melody.length <= after.measures.length; start++) {
    if (heldFrom(after, melody, start) > heldFrom(after, melody, best)) best = start;
  }
  return best;
}

/**
 * Measures `after`, the arranged score, against the song's bars and melody: on the song's bars
 * where the arrangement plays them (after an intro, if one was added before the tune).
 */
export function measure(after: Score, song: Melody): Measures {
  const melody = song.bars;
  const start = songStart(after, melody);
  const bars = after.measures.slice(start, start + melody.length);
  const all = lines(after);
  const ofInstrument = (id: InstrumentId) => all.filter((line) => line.instrument === id);
  const notesIn = (index: number, line: Line) => barEvents(bars[index], line.voiceId).filter(sounds);

  const present = BAND.filter((id) => ofInstrument(id).length > 0);
  let filled = 0;
  for (const id of present) {
    filled += bars.filter((_, i) => ofInstrument(id).some((line) => notesIn(i, line).length > 0)).length;
  }

  let outOfRange = 0;
  for (const line of all.filter((l) => !isDrumKit(l.instrument))) {
    for (const measureOf of after.measures) {
      const events = barEvents(measureOf, line.voiceId);
      outOfRange += events.flatMap(pitches).filter((midi) => !isPlayable(midi, line.instrument)).length;
    }
  }

  let [crowded, crowdedOf, melodyKept, melodyOf] = [0, 0, 0, 0];
  bars.forEach((_, i) => {
    if (!melody[i].length) return;
    melodyOf++;
    const holders = all.filter((line) => holds(notesIn(i, line), melody[i]));
    if (!holders.length) return;
    melodyKept++;
    // Where the melody sounds: each line that plays it as single notes (a doubling counts too).
    // A comping line whose chords top out on a one-note melody is still comping, and a bass
    // whose root is that note is still the bass.
    const single = (line: Line) => notesIn(i, line).every((event) => !event.stack);
    const leads = holders.filter((line) => single(line) && line.instrument !== "bass");
    const comps = all.filter((line) => COMPING.includes(line.instrument) && !leads.includes(line));
    const compTop = Math.max(...comps.flatMap((line) => notesIn(i, line).flatMap(pitches)));
    if (!leads.length || !Number.isFinite(compTop)) return;
    crowdedOf++;
    if (compTop > Math.min(...leads.flatMap((line) => notesIn(i, line).flatMap(pitches)))) crowded++;
  });

  let [roots, rootsOf] = [0, 0];
  const bass = ofInstrument("bass")[0];
  bars.forEach((_, i) => {
    const chord = chordAt(after, start + i);
    if (!chord) return;
    rootsOf++;
    const first = bass ? barEvents(bars[i], bass.voiceId)[0] : undefined;
    const allowed = [chord.root, ...(chord.bass ? [chord.bass] : [])].map(pitchClass);
    if (first?.pitch && allowed.includes(midiPitch(first.pitch) % OCTAVE)) roots++;
  });

  const drums = ofInstrument("drums");
  const drumBars = bars.filter((_, i) => drums.length >= 2 && drums.every((line) => notesIn(i, line).length)).length;

  return {
    parts: present.length,
    filled,
    filledOf: BAND.length * bars.length,
    outOfRange,
    crowded,
    crowdedOf,
    roots,
    rootsOf,
    drumBars,
    melodyKept,
    melodyOf,
  };
}
