import { INSTRUMENTS, isPlayable } from "../domain/instruments";
import { C_MAJOR, spellMidi } from "../domain/key";
import { midiPitch, pitchName } from "../domain/pitch";
import type { Score } from "../domain/schema";
import { voiceBars, voiceInfo } from "../domain/voice-access";

/** How far a transposing instrument is written above its sound, by semitones. */
const INTERVAL_NAMES: Record<number, string> = { 2: "a major 2nd", 12: "an octave" };

/**
 * Score-text lines about the instrument, after the header: what plays the part (nothing for a
 * piano, so a piano score reads as before), and every note outside the instrument's range.
 */
export function instrumentLines(score: Score): string[] {
  const part = score.parts[0];
  const instrument = INSTRUMENTS[part.instrument];
  const lines: string[] = [];
  if (part.instrument !== "piano") {
    const t = instrument.transposition;
    const shown = t
      ? ` (notes are concert pitch; the sheet shows them ${INTERVAL_NAMES[t.semitones] ?? `${t.semitones} semitones`} higher)`
      : "";
    lines.push(`instrument ${instrument.name}${shown}`);
  }
  const outside = score.measures.flatMap((measure, index) =>
    voiceBars(measure).flatMap((bar) => {
      const { instrument: id } = voiceInfo(score, bar.voiceId)!.part;
      return bar.events.flatMap((event, order) =>
        event.pitch && !isPlayable(midiPitch(event.pitch), id)
          ? [`${index + 1}#${order + 1} ${pitchName(event.pitch)}`]
          : [],
      );
    }),
  );
  if (outside.length) {
    const { low, high } = instrument.range;
    const range = `${pitchName(spellMidi(low, C_MAJOR))}–${pitchName(spellMidi(high, C_MAJOR))}`;
    lines.push(`out of range for ${instrument.name} (${range}): ${outside.join(", ")}`);
  }
  return lines;
}
