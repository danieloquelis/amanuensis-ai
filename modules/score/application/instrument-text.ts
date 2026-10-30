import { partHandles } from "../domain/handles";
import { INSTRUMENTS, isPlayable } from "../domain/instruments";
import { C_MAJOR, spellMidi } from "../domain/key";
import { midiPitch, pitchName } from "../domain/pitch";
import type { Part, Score } from "../domain/schema";
import { eventPitches } from "../domain/stacks";
import { allStaves, voiceBars, voiceInfo } from "../domain/voice-access";
import { positionOf } from "./notation-positions";

/** How far a transposing instrument is written above its sound, by semitones. */
const INTERVAL_NAMES: Record<number, string> = { 2: "a major 2nd", 12: "an octave" };

/** "notes are concert pitch; the sheet shows them a major 2nd higher" for a transposing instrument. */
function writtenNote(part: Part): string | null {
  const t = INSTRUMENTS[part.instrument].transposition;
  if (!t) return null;
  return `notes are concert pitch; the sheet shows them ${INTERVAL_NAMES[t.semitones] ?? `${t.semitones} semitones`} higher`;
}

/** One part for the "parts:" line: `trumpet "Trumpet in B♭" (written …)`, `piano "Piano" (treble+bass)`. */
function partEntry(part: Part, handle: string): string {
  const details = [part.staves.length > 1 ? part.staves.map((s) => s.clef).join("+") : null, writtenNote(part)];
  const muted = part.muted ? "; muted" : "";
  const shown = details.filter(Boolean).join("; ");
  return `${handle} "${part.name}"${shown || muted ? ` (${shown}${muted})` : ""}`;
}

/**
 * Score-text lines about the instruments, after the header. One staff: what plays it (nothing for
 * a piano, so a piano score reads as before). Several: a "parts:" line with each part's handle,
 * name and staves. Then every note outside its instrument's range, by part.
 */
export function instrumentLines(score: Score): string[] {
  const lines: string[] = [];
  const handles = partHandles(score);
  if (allStaves(score).length > 1) {
    lines.push(`parts: ${score.parts.map((part) => partEntry(part, handles.get(part.id)!)).join(" | ")}`);
  } else if (score.parts[0].instrument !== "piano") {
    const note = writtenNote(score.parts[0]);
    lines.push(`instrument ${INSTRUMENTS[score.parts[0].instrument].name}${note ? ` (${note})` : ""}`);
  }
  for (const part of score.parts) {
    const outside = score.measures.flatMap((measure) =>
      voiceBars(measure)
        .filter((bar) => voiceInfo(score, bar.voiceId)?.part.id === part.id)
        .flatMap((bar) =>
          bar.events.flatMap((event) => {
            const notes = eventPitches(event);
            const out = notes.filter((p) => !isPlayable(midiPitch(p), part.instrument));
            return out.length ? [`${positionOf(score, event.id)} ${out.map(pitchName).join(" ")}`] : [];
          }),
        ),
    );
    if (!outside.length) continue;
    const { name, range } = INSTRUMENTS[part.instrument];
    const span = `${pitchName(spellMidi(range.low, C_MAJOR))}–${pitchName(spellMidi(range.high, C_MAJOR))}`;
    lines.push(`out of range for ${name} (${span}): ${outside.join(", ")}`);
  }
  return lines;
}
