import { formatChord } from "../domain/chords";
import { eventPitches } from "../domain/stacks";
import { instrumentLines } from "./instrument-text";
import { keyName, scoreKey } from "../domain/key";
import { beats, eventOnsets, meterName } from "../domain/rhythm";
import type { Pitch, Score, ScoreEvent } from "../domain/schema";
import { partHandles, staffHandle } from "../domain/handles";
import { allStaves, barStyle, voiceBars, voiceInfo, voiceNumber } from "../domain/voice-access";

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
Each bar's durations must add up to its meter exactly (4/4: 4 quarter beats; 2/2, cut time or alla breve ₵: also 4, felt in two half-note beats; 6/8: 3). Tempo is always quarter-note BPM: cut time marked half = 100 is tempo 200.
Notes sounding together on one stem (a chord within the voice): <C4 E4 G4>q; tied <C4 E4>h~.
After a note: ~ ties it into the next note (same pitch, may be in the next bar); !staccato, !accent, !tenuto or !fermata.
Slurs: ( before the first note and ) after the last note of the phrase; may span bars.
A staff may hold two voices: "bar 2 v2: …" is the second line of bar 2 (stems down, e.g. a bass under the melody), complete in itself; "bar 2 v2: -" removes it; its notes are 2v2#1, 2v2:3. Chords, section and marks belong to the bar's first line.
Drums: <hat snare>e are pieces struck together (kick snare stick tom1 tom2 tom3 hat hatopen hatfoot crash ride bell); hands (cymbals, snare, toms) in the main line, feet (kick, hatfoot) in v2; "bar N v2: -" leaves a bar without feet. A hit sounds once: no ties.
With several staves, a "parts:" line lists their handles and every line names its staff: "bar 3 trumpet: …", "bar 3 piano.2 v2: …"; notes there are trumpet/3#2, piano.2/3v2:1.
Pitches are concert pitch (as they sound) for every instrument; an "instrument" line says when the sheet shows a part transposed, and an "out of range" line lists notes the instrument can't play comfortably.
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

/** One note, chord, drum hit or rest as score text: "C4q", "<C4 E4>h~", "<snare hat>e", "re.", "R". */
export function eventText(event: ScoreEvent): string {
  if (event.measureRest) return "R";
  const value = durationCode(beats(event.duration)) ?? "?";
  // A chord: its notes in angle brackets, lowest first ("<C4 E4 G4>q").
  const notes = eventPitches(event);
  const pitches = event.drums
    ? `<${event.drums.join(" ")}>`
    : notes.length > 1
      ? `<${notes.map(pitchText).join(" ")}>`
      : notes.length
        ? pitchText(notes[0])
        : "r";
  const head = `${pitches}${value}`;
  return `${head}${event.tie ? "~" : ""}${event.articulation ? `!${event.articulation}` : ""}`;
}

/** "@2.5" for a beat (0-based) inside the bar; nothing for the downbeat. */
const at = (beat: number) => (beat ? `@${beat + 1}` : "");

/**
 * Indications on these events, and those on the bar that belong to this line's staff (`staffId`;
 * a bar's text without a staff goes on the bar's first line), with their beat in the bar.
 */
function labelParts(
  score: Score,
  bar: { id: string; staffId: string | null; first: boolean },
  onsets: Map<string, number>,
): string[] {
  const onBar = (a: Score["annotations"][number]) =>
    a.targetId === bar.id && (a.staffId ? a.staffId === bar.staffId : bar.first);
  const anchored = (a: Score["annotations"][number]) => (onBar(a) ? 0 : onsets.get(a.targetId));
  return score.annotations
    .filter((a) => anchored(a) !== undefined)
    .map((a) =>
      a.kind === "dynamic" ? `dynamics ${a.text}${at(anchored(a)!)}` : `text "${a.text}"${at(anchored(a)!)}`,
    );
}

/** Part handles to show ("trumpet"), and bars from–to (numbered from 1); everything when omitted. */
export type ScoreTextFilter = { parts?: string[]; bars?: { from: number; to: number } };

/**
 * The whole score as text: a header, one line per bar (then one per further voice in it, "bar 1
 * v2: …"), then repeats. What belongs to the bar (chords, section, tempo, marks) is on its first
 * line. With several staves every line names its staff: "bar 3 piano: …", "bar 3 trumpet v2: …".
 * A large score can be read in part: only some parts' lines (by handle), or a range of bars.
 */
export function scoreText(score: Score, only: ScoreTextFilter = {}): string {
  const opens = new Set(score.slurs.map((s) => s.startEventId));
  const closes = new Set(score.slurs.map((s) => s.endEventId));
  const header = `revision ${score.revision}; title "${score.title}"; key ${keyName(scoreKey(score))}; tempo ${score.tempo}; meter ${meterName(score.measures[0].meter)}`;
  const named = allStaves(score).length > 1;
  const handles = partHandles(score);
  const lines = score.measures.flatMap((measure, index) => {
    if (only.bars && (index + 1 < only.bars.from || index + 1 > only.bars.to)) return [];
    const previous = score.measures[index - 1];
    const meterChange = previous && meterName(previous.meter) !== meterName(measure.meter);
    const shown = voiceBars(measure).filter(
      ({ voiceId }) => !only.parts || only.parts.includes(handles.get(voiceInfo(score, voiceId)!.part.id)!),
    );
    return voiceBars(measure).flatMap((voiceBar, k) => {
      if (!shown.includes(voiceBar)) return [];
      const { events } = voiceBar;
      const starts = eventOnsets(events);
      const onsets = new Map(events.map((event, i) => [event.id, starts[i]]));
      const notes = events.map((event) => {
        return `${opens.has(event.id) ? "(" : ""}${eventText(event)}${closes.has(event.id) ? ")" : ""}`;
      });
      const main = k === 0;
      const chords = score.chords.filter((c) => c.measureId === measure.id).sort((a, b) => a.beat - b.beat);
      const marks = score.marks.filter((m) => m.measureId === measure.id);
      const parts = main
        ? [
            chords.length ? `chords ${chords.map((c) => `${formatChord(c)}${at(c.beat)}`).join(" ")}` : null,
            measure.section ? `section ${measure.section}` : null,
            barStyle(measure) ? `shows ${barStyle(measure)}` : null,
            measure.tempo ? `tempo ${measure.tempo}` : null,
            marks.length ? `marks ${marks.map((m) => m.kind).join(" ")}` : null,
          ]
        : [];
      const info = voiceInfo(score, voiceBar.voiceId)!;
      const staffId = info.voiceIndex === 0 ? info.staff.id : null;
      const labels = labelParts(score, { id: measure.id, staffId, first: main }, onsets);
      const meter = main && meterChange ? ` (${meterName(measure.meter)})` : "";
      const number = voiceNumber(score, voiceBar.voiceId);
      const staff = named ? ` ${staffHandle(score, info.staff.id)}` : "";
      const voice = `${staff}${number > 1 ? ` v${number}` : ""}`;
      return [
        [`bar ${index + 1}${meter}${voice}: ${notes.join(" ")}`, ...parts.filter(Boolean), ...labels].join(" ; "),
      ];
    });
  });
  const repeats = score.repeats.map((r) => {
    const bar = (id: string) => score.measures.findIndex((m) => m.id === id) + 1;
    return `repeat bars ${bar(r.startMeasureId)}-${bar(r.endMeasureId)} x${r.count}`;
  });
  return [header, ...instrumentLines(score), ...lines, ...repeats].join("\n");
}
