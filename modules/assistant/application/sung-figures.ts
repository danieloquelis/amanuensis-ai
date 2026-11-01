import { midiPitch, pitchName, spellMidi, type KeySignature, type Pitch } from "@/modules/score";
import type { WrittenBar } from "./transcription-placement";

/**
 * A note the musician's own singing supports changing: to the pitch the ear nearly heard, or to
 * the one that makes a figure match the same figure sung elsewhere. `bar` is the score bar (from
 * 1), `beat` quarter beats into it (from 0), `line` the line written ("v1", "v2", a handle).
 */
export type HeardOption = { bar: number; beat: number; line: string; pitch: Pitch; why: string };

/** A figure this short says too little to compare; two notes may differ in at most this share. */
const MIN_FIGURE_NOTES = 3;
const MAX_DIFFERENT_SHARE = 1 / 3;

type Attack = { beat: number; midi: number; pitch: Pitch };

/** A bar's notes as attacks (a tied chain once), with their beat in the bar. */
function attacksOf(events: WrittenBar): Attack[] {
  const found: Attack[] = [];
  let at = 0;
  let tiedOn = false;
  for (const event of events) {
    if (event.pitch && !tiedOn) found.push({ beat: at, midi: midiPitch(event.pitch), pitch: event.pitch });
    tiedOn = Boolean(event.pitch && event.tie);
    at += event.duration;
  }
  return found;
}

const rhythmOf = (attacks: Attack[]) => attacks.map((a) => a.beat).join(",");
const beatName = (beat: number) => `beat ${Number((beat + 1).toFixed(2))}`;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Where the transcribed bars repeat a figure: the same rhythm with the same notes, or the same
 * shape at another pitch (a sequence). Where a figure nearly repeats, the notes that break it
 * become options, so a musician's judgement ("bar 5 is bar 1 again") can be acted on from what
 * was actually sung. Each bar is compared with the bars before it.
 *
 * @param bars the transcribed bars, in order
 * @param firstBar the score bar the first of them is in
 */
export function sungFigures(
  bars: WrittenBar[],
  firstBar: number,
  line: string,
  key: KeySignature,
): { figures: string[]; options: HeardOption[] } {
  const attacks = bars.map(attacksOf);
  const figures: string[] = [];
  const options: HeardOption[] = [];
  attacks.forEach((later, j) => {
    for (let i = 0; i < j; i++) {
      const earlier = attacks[i];
      if (later.length < MIN_FIGURE_NOTES || rhythmOf(later) !== rhythmOf(earlier)) continue;
      const [a, b] = [firstBar + i, firstBar + j];
      const shift = median(later.map((note, k) => note.midi - earlier[k].midi));
      const breaks = later.flatMap((note, k) => (note.midi - earlier[k].midi === shift ? [] : [k]));
      if (breaks.length > later.length * MAX_DIFFERENT_SHARE) continue;
      const same =
        shift === 0
          ? `bar ${a}'s figure`
          : `bar ${a}'s figure ${shift > 0 ? "up" : "down"} ${Math.abs(shift)} semitones`;
      if (!breaks.length) {
        figures.push(`bar ${b} repeats ${same}`);
        break;
      }
      const differences = breaks.map((k) => {
        const fits = spellMidi(earlier[k].midi + shift, key);
        options.push({ bar: b, beat: later[k].beat, line, pitch: fits, why: `matches ${same}` });
        return `${beatName(later[k].beat)} ${pitchName(later[k].pitch)} where it gives ${pitchName(fits)}`;
      });
      figures.push(`bar ${b} repeats ${same} except ${differences.join(", ")}`);
      break;
    }
  });
  return { figures, options };
}

/**
 * Everything one span's own singing supports changing in the bars it was written to: each
 * doubtful note's runner-up, and the notes that would complete a figure sung elsewhere.
 *
 * @param uncertain the ear's doubtful notes, by bar of the span (from 1) and beat (from 0)
 */
export function heardOptions(
  bars: WrittenBar[],
  uncertain: { bar: number; beat: number; alternative: Pitch }[],
  firstBar: number,
  line: string,
  key: KeySignature,
): { figures: string[]; options: HeardOption[] } {
  const { figures, options } = sungFigures(bars, firstBar, line, key);
  const doubtful = uncertain
    .filter((u) => u.bar <= bars.length)
    .map((u) => ({ bar: firstBar + u.bar - 1, beat: u.beat, line, pitch: u.alternative, why: "nearly heard" }));
  return { figures, options: [...doubtful, ...options] };
}
