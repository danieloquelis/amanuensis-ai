import { CHORD_QUALITIES, formatChord, type ChordQuality } from "./chords";
import { spellMidi } from "./key";
import { midiPitch } from "./pitch";
import { measureCapacity } from "./rhythm";
import type { KeySignature, Score } from "./schema";

type Role = "tonic" | "subdominant" | "dominant";
type Degree = { step: number; quality: ChordQuality; role: Role; tonic?: true };

/** The chords of each mode a lead sheet usually uses, by scale step (semitones above the tonic). */
const DEGREES: Record<KeySignature["mode"], Degree[]> = {
  major: [
    { step: 0, quality: "", role: "tonic", tonic: true },
    { step: 2, quality: "m", role: "subdominant" },
    { step: 4, quality: "m", role: "tonic" },
    { step: 5, quality: "", role: "subdominant" },
    { step: 7, quality: "", role: "dominant" },
    { step: 7, quality: "7", role: "dominant" },
    { step: 9, quality: "m", role: "tonic" },
  ],
  minor: [
    { step: 0, quality: "m", role: "tonic", tonic: true },
    { step: 3, quality: "", role: "tonic" },
    { step: 5, quality: "m", role: "subdominant" },
    { step: 7, quality: "", role: "dominant" },
    { step: 7, quality: "7", role: "dominant" },
    { step: 8, quality: "", role: "subdominant" },
    { step: 10, quality: "", role: "dominant" },
  ],
};

/**
 * How unlikely one chord is after another, by harmonic function, as common practice hears it:
 * dominant → tonic resolves, subdominant → dominant prepares, dominant → subdominant runs
 * backwards. Lower is more natural.
 */
const MOVE_COST: Record<Role, Record<Role, number>> = {
  tonic: { tonic: 0.4, subdominant: 0.1, dominant: 0.2 },
  subdominant: { tonic: 0.4, subdominant: 0.3, dominant: 0 },
  dominant: { tonic: 0, subdominant: 0.9, dominant: 0.1 },
};
const REPEAT_COST = 0.2;
/** A piece starts on its tonic and ends there (or, mid-phrase, on the dominant). */
const START_OFF_TONIC = 0.5;
const END_ON_DOMINANT = 0.6;
const END_ELSEWHERE = 1.2;
/** How much a chord's fit to the melody counts against the progression's shape. */
const FIT_WEIGHT = 3;
/** A seventh the melody doesn't sing is extra colour, chosen only when it helps. */
const UNSUNG_SEVENTH = 0.05;
/** Notes on the slot's first beat weigh more; long notes more than passing ones (up to a half). */
const STRONG_BEAT = 1.5;
const LONGEST_WEIGHT = 2;
/**
 * A note outside the chord that steps (a tone or semitone) to the next note, a chord tone, is an
 * embellishment (appoggiatura, passing or neighbour note): it counts half against the chord.
 */
const EMBELLISHMENT = 0.5;
const STEP = 2;
const SHOWN_CANDIDATES = 3;

export type ChordCandidate = { symbol: string; fit: number };
export type ChordSlot = { bar: number; beat: number; best: string; candidates: ChordCandidate[] };
export type Harmonization = { progression: string[]; slots: ChordSlot[] };
/** A sung note: its MIDI pitch, how much it counts, and the note sung after it (if any). */
type SlotNotes = { midi: number; weight: number; next?: number }[];

const tonicOf = (key: KeySignature) => (((key.fifths * 7) % 12) + 12 + (key.mode === "minor" ? 9 : 0)) % 12;

/** The chords of `key`, spelled in it ("Bm", "F♯7"…), with their pitch classes. */
function chordsOf(key: KeySignature) {
  const tonic = tonicOf(key);
  return DEGREES[key.mode].map((degree) => {
    const rootClass = (tonic + degree.step) % 12;
    const spelled = spellMidi(60 + rootClass, key);
    const tones = CHORD_QUALITIES[degree.quality].map((interval: number) => (rootClass + interval) % 12);
    const symbol = formatChord({ root: { step: spelled.step, alter: spelled.alter }, quality: degree.quality });
    return { ...degree, symbol, tones, seventh: tones.length > 3 ? tones[3] : null };
  });
}

/** The sung notes under each chord slot (`perBar` slots per bar) of bars `from`–`to` (from 1). */
function slotNotes(
  score: Score,
  from: number,
  to: number,
  perBar: number,
): { bar: number; beat: number; notes: SlotNotes }[] {
  const slots = score.measures.slice(from - 1, to).flatMap((measure, offset) => {
    const length = measureCapacity(measure.meter) / perBar;
    const slots = Array.from({ length: perBar }, (_, i) => ({
      bar: from + offset,
      beat: i * length,
      notes: [] as SlotNotes,
    }));
    let beat = 0;
    for (const event of measure.events) {
      const duration = event.duration.numerator / event.duration.denominator;
      const slot = slots[Math.min(perBar - 1, Math.floor(beat / length + 1e-9))];
      if (event.pitch) {
        const strong = Math.abs(beat - slot.beat) < 1e-9 ? STRONG_BEAT : 1;
        slot.notes.push({ midi: midiPitch(event.pitch), weight: strong * Math.min(duration, LONGEST_WEIGHT) });
      }
      beat += duration;
    }
    return slots;
  });
  // Each note knows the next one sung, across slots and bars, to recognise embellishments.
  const sung = slots.flatMap((slot) => slot.notes);
  sung.forEach((note, i) => (note.next = sung[i + 1]?.midi));
  return slots;
}

/**
 * Share of the slot's sung weight the chord accounts for (0–1): its tones fully, embellishments
 * that step to one of its tones by half. An empty slot fits anything.
 */
function fitOf(tones: number[], notes: SlotNotes): number {
  const total = notes.reduce((sum, note) => sum + note.weight, 0);
  if (!total) return 1;
  const isTone = (midi: number) => tones.includes(((midi % 12) + 12) % 12);
  const accounted = notes.reduce((sum, note) => {
    if (isTone(note.midi)) return sum + note.weight;
    const resolves = note.next !== undefined && Math.abs(note.next - note.midi) <= STEP && isTone(note.next);
    return sum + (resolves ? note.weight * EMBELLISHMENT : 0);
  }, 0);
  return accounted / total;
}

/**
 * Chords for a melody in `key`, one per bar (or `perBar` per bar), the way a musician harmonizes
 * a lead sheet: each slot's chord should hold the notes sung over it (strong beats and long notes
 * first), and the whole should move like music, starting and ending home, with dominants
 * resolving. Returns the most likely progression and each slot's closest alternatives.
 */
export function suggestChords(
  score: Score,
  options: { key: KeySignature; from: number; to: number; perBar?: number },
): Harmonization {
  const chords = chordsOf(options.key);
  const slots = slotNotes(score, options.from, options.to, options.perBar ?? 1);
  const fits = slots.map(({ notes }) =>
    chords.map((chord) => {
      const sungSeventh = chord.seventh !== null && notes.some((n) => ((n.midi % 12) + 12) % 12 === chord.seventh);
      return { fit: fitOf(chord.tones, notes), extra: chord.seventh !== null && !sungSeventh ? UNSUNG_SEVENTH : 0 };
    }),
  );
  const local = (slot: number, chord: number) => (1 - fits[slot][chord].fit) * FIT_WEIGHT + fits[slot][chord].extra;
  const endCost = (chord: (typeof chords)[number]) =>
    chord.tonic ? 0 : chord.role === "dominant" ? END_ON_DOMINANT : END_ELSEWHERE;

  // Viterbi over the slots: cost[i] is the best progression so far ending on chord i.
  let cost = chords.map((chord, i) => local(0, i) + (chord.tonic ? 0 : START_OFF_TONIC));
  const back: number[][] = [];
  for (let slot = 1; slot < slots.length; slot++) {
    const from: number[] = [];
    cost = chords.map((chord, i) => {
      let best = { total: Infinity, previous: 0 };
      chords.forEach((previous, j) => {
        const move = j === i ? REPEAT_COST : MOVE_COST[previous.role][chord.role];
        if (cost[j] + move < best.total) best = { total: cost[j] + move, previous: j };
      });
      from.push(best.previous);
      return best.total + local(slot, i);
    });
    back.push(from);
  }
  const finals = cost.map((c, i) => c + endCost(chords[i]));
  const path = [finals.indexOf(Math.min(...finals))];
  for (let slot = back.length - 1; slot >= 0; slot--) path.unshift(back[slot][path[0]]);

  return {
    progression: path.map((i) => chords[i].symbol),
    slots: slots.map(({ bar, beat }, slot) => ({
      bar,
      beat,
      best: chords[path[slot]].symbol,
      candidates: chords
        .map((chord, i) => ({ symbol: chord.symbol, fit: Math.round(fits[slot][i].fit * 100) / 100 }))
        .sort((a, b) => b.fit - a.fit)
        .slice(0, SHOWN_CANDIDATES),
    })),
  };
}
