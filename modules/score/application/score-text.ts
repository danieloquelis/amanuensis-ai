import { formatChord } from "../domain/chords";
import { keyName, scoreKey } from "../domain/key";
import { beats, meterName } from "../domain/rhythm";
import type { Pitch, Score, ScoreEvent } from "../domain/schema";

/**
 * Score text: a compact, line-per-bar view of a score for language models, roughly a tenth the
 * size of the JSON view. Each bar reads `bar 2: D4e (E4e F4e G4e) A4h ; chords Fm G7@3`.
 * Writing uses the same syntax (see `writeBars`), so what the agent reads is what it writes.
 */

/** Duration codes: whole, half, quarter, eighth, sixteenth; a trailing "." dots them. */
export const DURATION_CODES = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 } as const;
const DOT = 1.5;
const ACCIDENTALS: Record<number, string> = { [-1]: "b", 0: "", 1: "#" };

/** The format, explained for a prompt. */
export const SCORE_TEXT_GUIDE = `Score text, one line per bar: "bar N: notes ; part ; part".
Notes: pitch then duration, e.g. C4q, F#4e, Bb3h. (C4 is middle C; # sharp, b flat.)
Durations: w whole, h half, q quarter, e eighth, s sixteenth; add "." for dotted (q. = 1.5 beats). Rests: rq, re., …; R is a whole-bar rest.
Each bar's durations must add up to its meter exactly (4/4: 4 quarter beats).
After a note: ~ ties it into the next note (same pitch, may be in the next bar); !staccato, !accent, !tenuto or !fermata.
Slurs: ( before the first note and ) after the last note of the phrase; may span bars.
Parts after ";": chords C Am7@3 (beats from 1, @1 may be left out), section A, and read-only: shows slashes|repeat, tempo N, marks …, dynamics mf@2, text "…"@1.`;

export const pitchText = (pitch: Pitch) => `${pitch.step}${ACCIDENTALS[pitch.alter]}${pitch.octave}`;

/** "q", "e.", …; null for a value with no code. */
export function durationCode(value: number): string | null {
  for (const [code, base] of Object.entries(DURATION_CODES)) {
    if (value === base) return code;
    if (value === base * DOT) return `${code}.`;
  }
  return null;
}

function eventText(event: ScoreEvent): string {
  if (event.measureRest) return "R";
  const value = durationCode(beats(event.duration)) ?? "?";
  const head = event.pitch ? `${pitchText(event.pitch)}${value}` : `r${value}`;
  return `${head}${event.tie ? "~" : ""}${event.articulation ? `!${event.articulation}` : ""}`;
}

/** "@2.5" for a beat (0-based) inside the bar; nothing for the downbeat. */
const at = (beat: number) => (beat ? `@${beat + 1}` : "");

/** The whole score as text: a header, one line per bar, then repeats. */
export function scoreText(score: Score): string {
  const opens = new Set(score.slurs.map((s) => s.startEventId));
  const closes = new Set(score.slurs.map((s) => s.endEventId));
  const header = `revision ${score.revision}; title "${score.title}"; key ${keyName(scoreKey(score))}; tempo ${score.tempo}; meter ${meterName(score.measures[0].meter)}`;
  const lines = score.measures.map((measure, index) => {
    const previous = score.measures[index - 1];
    const meterChange = previous && meterName(previous.meter) !== meterName(measure.meter);
    let beat = 0;
    const onsets = new Map<string, number>();
    const notes = measure.events.map((event) => {
      onsets.set(event.id, beat);
      beat += beats(event.duration);
      return `${opens.has(event.id) ? "(" : ""}${eventText(event)}${closes.has(event.id) ? ")" : ""}`;
    });
    const anchored = (targetId: string) => (targetId === measure.id ? 0 : onsets.get(targetId));
    const chords = score.chords.filter((c) => c.measureId === measure.id).sort((a, b) => a.beat - b.beat);
    const marks = score.marks.filter((m) => m.measureId === measure.id);
    const labels = score.annotations.filter((a) => anchored(a.targetId) !== undefined);
    const parts = [
      chords.length ? `chords ${chords.map((c) => `${formatChord(c)}${at(c.beat)}`).join(" ")}` : null,
      measure.section ? `section ${measure.section}` : null,
      measure.style ? `shows ${measure.style === "slashes" ? "slashes" : "repeat"}` : null,
      measure.tempo ? `tempo ${measure.tempo}` : null,
      marks.length ? `marks ${marks.map((m) => m.kind).join(" ")}` : null,
      ...labels.map((a) =>
        a.kind === "dynamic"
          ? `dynamics ${a.text}${at(anchored(a.targetId)!)}`
          : `text "${a.text}"${at(anchored(a.targetId)!)}`,
      ),
    ].filter(Boolean);
    const meter = meterChange ? ` (${meterName(measure.meter)})` : "";
    return [`bar ${index + 1}${meter}: ${notes.join(" ")}`, ...parts].join(" ; ");
  });
  const repeats = score.repeats.map((r) => {
    const bar = (id: string) => score.measures.findIndex((m) => m.id === id) + 1;
    return `repeat bars ${bar(r.startMeasureId)}-${bar(r.endMeasureId)} x${r.count}`;
  });
  return [header, ...lines, ...repeats].join("\n");
}
