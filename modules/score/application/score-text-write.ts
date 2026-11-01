import { applyCommand } from "../domain/operations/apply-command";
import type { BasicOperation, Command, DurationValue } from "../domain/operations/schema";
import { spellRhythm } from "../domain/rhythm-spelling";
import type { Meter, Pitch, Score } from "../domain/schema";
import { findStaff, staffHandle } from "../domain/handles";
import { scoreKey } from "../domain/key";
import { toConcert, transpositionOf } from "../domain/transposition";
import { allStaves } from "../domain/voice-access";
import { checkFills, checkLength } from "./score-text-checks";
import { parseBarsText, type WrittenBar, type WrittenEvent } from "./score-text-parse";

/**
 * A bar's values spelled as a musician would at their place in it (see `spellRhythm`): "C4h"
 * from the off-beat of 1 becomes "C4q.~ C4e". A split note keeps its articulation and slur start
 * on its first part, its slur end and its own tie on its last; a split drum hit is followed by rests.
 */
function spelled(events: WrittenEvent[], meter: Meter): WrittenEvent[] {
  let at = 0;
  return events.flatMap((event, i) => {
    // A triplet is written as given; the next value starts where the whole group ends.
    if (event.tuplet !== null) {
      if (events[i + 1]?.tuplet !== event.tuplet) at = Math.round((at + soundingLength(events, i)) * 8) / 8;
      return [event];
    }
    const silent = event.pitch === null && !event.drums.length;
    const parts = spellRhythm(at, event.duration, meter, silent);
    at += event.duration;
    return parts.map((duration, k) => {
      const [first, last] = [k === 0, k === parts.length - 1];
      // A drum hit sounds once: past its first part, its length is silence.
      if (event.drums.length && !first)
        return {
          ...event,
          duration: duration as DurationValue,
          drums: [],
          tie: false,
          articulation: null,
          opensSlur: false,
          closesSlur: false,
        };
      return {
        ...event,
        duration: duration as DurationValue,
        tie: event.pitch !== null && (last ? event.tie : true),
        articulation: first ? event.articulation : null,
        opensSlur: first && event.opensSlur,
        closesSlur: last && event.closesSlur,
      };
    });
  });
}

/** How long the triplet ending at `last` sounds: its written values in two thirds of their time. */
function soundingLength(events: WrittenEvent[], last: number): number {
  let written = 0;
  for (let i = last; i >= 0 && events[i].tuplet === events[last].tuplet; i--) written += events[i].duration;
  return (written * 2) / 3;
}

/** How a line's pitches are given: as they sound (concert, the default) or as the part's page shows them. */
export type WrittenPitches = "concert" | "written";

/**
 * A line copied from a transposing part's page, at the pitches it sounds: a B♭ trumpet's written
 * D5 is a concert C5. Lines of other parts are returned as they are.
 */
function soundingLine(score: Score, staff: string | undefined, events: WrittenEvent[]): WrittenEvent[] {
  const staffId = staff ? findStaff(score, staff)?.id : allStaves(score)[0].id;
  const part = score.parts.find((candidate) => candidate.staves.some((s) => s.id === staffId));
  const transposition = part && transpositionOf(part.instrument);
  if (!transposition) return events;
  const sounding = (pitch: Pitch) => toConcert(pitch, transposition, scoreKey(score));
  return events.map((event) => ({
    ...event,
    pitch: event.pitch && sounding(event.pitch),
    stack: event.stack.map(sounding),
  }));
}

/**
 * IDs that operation `index` of a command creates: `apply-command` gives each operation the prefix
 * "<requestId>-<index>", and bars and notes take it as below. Lets one batch refer to notes it writes.
 */
const createdBarId = (requestId: string, index: number) => `${requestId}-${index}-bar`;
const createdNoteId = (requestId: string, index: number, note: number) => `${requestId}-${index}-n${note}`;

/**
 * The chords each written bar ends up with: a bar's main line sets them (none listed clears them);
 * another voice's line leaves them alone unless it lists chords. Two lines listing chords for one
 * bar is an error.
 */
function harmonyByBar(bars: WrittenBar[], isMain: (line: WrittenBar) => boolean): Map<number, WrittenBar["chords"]> {
  const listed = new Map<number, WrittenBar["chords"]>();
  for (const { bar, chords } of bars) {
    if (!chords.length) continue;
    if (listed.has(bar)) throw new Error(`Bar ${bar}: give its chords on one line only.`);
    listed.set(bar, chords);
  }
  const result = new Map<number, WrittenBar["chords"]>();
  for (const line of bars)
    if ((isMain(line) && !line.remove) || listed.has(line.bar)) result.set(line.bar, listed.get(line.bar) ?? []);
  return result;
}

/**
 * Writes whole bars given as score text: each listed bar is replaced by what its line says
 * (notes, ties, slurs, articulations, chords, section; with `keepHarmony`, a line that lists no
 * chords or section leaves the bar's as they are), each value spelled as a musician would at
 * its place in the bar; bars past the end are added. "bar N vK:" lines write voice K (adding it to
 * the bar when needed) and "bar N vK: -" removes it, leaving the bar's main line alone. One command, so one undo step; it is
 * validated like any edit. With `pitches: "written"`, transposing parts' lines are read as their
 * page shows them and stored at concert pitch.
 */
export function writeBars(
  score: Score,
  text: string,
  requestId: string,
  pitches: WrittenPitches = "concert",
  { keepHarmony = false }: { keepHarmony?: boolean } = {},
): { score: Score; command: Command } {
  const bars = parseBarsText(text);
  if (!bars.length) throw new Error('Write at least one bar line ("bar N: notes").');
  const operations: BasicOperation[] = [];
  const measureIds = score.measures.map((m) => m.id);
  checkLength(bars);
  const missing = Math.max(0, Math.max(...bars.map((b) => b.bar)) - score.measures.length);
  for (let i = 0; i < missing; i++) {
    measureIds.push(createdBarId(requestId, operations.length));
    operations.push({ type: "appendMeasure" });
  }
  const written: (WrittenEvent & { id: string; line: string })[] = [];
  // The bar's first line (the first staff's main line) carries what belongs to the whole bar.
  const first = staffHandle(score, allStaves(score)[0].id);
  const isMain = (line: WrittenBar) => line.voice === 1 && (!line.staff || line.staff === first);
  // Bars added at the end take the last bar's meter.
  const meterOf = (bar: number) => (score.measures[bar - 1] ?? score.measures.at(-1)!).meter;
  checkFills(bars, meterOf);
  for (const line of bars) {
    const { bar, staff, voice, remove, events, section } = line;
    const measureId = measureIds[bar - 1];
    if (!measureId) throw new Error(`There is no bar ${bar}.`);
    // Lines name their staff and voice ("trumpet/v1", "v2"); the operations resolve them when they run.
    const voiceId = `${staff ? `${staff}/` : ""}v${voice}`;
    if (remove) {
      operations.push({ type: "removeVoiceBars", voiceId, measureIds: [measureId] });
      continue;
    }
    if (voice > 1)
      operations.push({ type: "addVoiceBars", voice, measureIds: [measureId], ...(staff ? { staffId: staff } : {}) });
    const index = operations.length;
    if (events) {
      const meter = meterOf(bar);
      const parts = spelled(pitches === "written" ? soundingLine(score, staff, events) : events, meter);
      const notes = parts.map(({ pitch, stack, drums, duration, tie, tuplet }) => ({
        pitch,
        ...(stack.length ? { stack } : {}),
        ...(drums.length ? { drums } : {}),
        duration,
        tie,
        ...(tuplet !== null ? { tuplet } : {}),
      }));
      operations.push({ type: "replaceMeasure", measureId, events: notes, ...(voice > 1 || staff ? { voiceId } : {}) });
      parts.forEach((event, k) => written.push({ ...event, line: voiceId, id: createdNoteId(requestId, index, k) }));
    } else {
      operations.push({ type: "clearMeasure", measureId, voiceId });
    }
    const hadSection = !!score.measures.find((m) => m.id === measureId)?.section;
    const sets = section || (hadSection && !keepHarmony);
    if (isMain(line) && sets) operations.push({ type: "setSection", measureId, label: section });
  }
  // With keepHarmony, only lines that list chords change them: the main line no longer clears them.
  for (const [bar, chords] of harmonyByBar(bars, keepHarmony ? () => false : isMain)) {
    const measureId = measureIds[bar - 1];
    for (const chord of score.chords.filter((c) => c.measureId === measureId)) {
      operations.push({ type: "removeNotation", id: chord.id });
    }
    for (const chord of chords)
      operations.push({ type: "putChord", measureId, beat: chord.beat, symbol: chord.symbol });
  }
  // A slur stays within its voice: track the open one per voice.
  const open = new Map<string, string>();
  for (const event of written) {
    if (event.articulation)
      operations.push({ type: "setArticulation", eventId: event.id, articulation: event.articulation });
    if (event.opensSlur) open.set(event.line, event.id);
    const start = open.get(event.line);
    if (event.closesSlur && start) operations.push({ type: "putSlur", startEventId: start, endEventId: event.id });
    if (event.closesSlur) open.delete(event.line);
  }
  const command: Command = { requestId, expectedRevision: score.revision, operation: { type: "batch", operations } };
  return { score: applyCommand(score, command), command };
}
