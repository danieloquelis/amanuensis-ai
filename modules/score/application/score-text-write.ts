import { applyCommand } from "../domain/operations/apply-command";
import type { BasicOperation, Command, DurationValue } from "../domain/operations/schema";
import { spellRhythm } from "../domain/rhythm-spelling";
import type { Meter, Score } from "../domain/schema";
import { staffHandle } from "../domain/handles";
import { allStaves } from "../domain/voice-access";
import { parseBarsText, type WrittenBar, type WrittenEvent } from "./score-text-parse";

/**
 * A bar's values spelled as a musician would at their place in it (see `spellRhythm`): "C4h"
 * from the off-beat of 1 becomes "C4q.~ C4e". A split note keeps its articulation and slur start
 * on its first part, its slur end and its own tie on its last.
 */
function spelled(events: WrittenEvent[], meter: Meter): WrittenEvent[] {
  let at = 0;
  return events.flatMap((event) => {
    const parts = spellRhythm(at, event.duration, meter, event.pitch === null);
    at += event.duration;
    return parts.map((duration, k) => {
      const [first, last] = [k === 0, k === parts.length - 1];
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
 * (notes, ties, slurs, articulations, chords, section), each value spelled as a musician would at
 * its place in the bar; bars past the end are added. "bar N vK:" lines write voice K (adding it to
 * the bar when needed) and "bar N vK: -" removes it, leaving the bar's main line alone. One command, so one undo step; it is
 * validated like any edit.
 */
export function writeBars(score: Score, text: string, requestId: string): { score: Score; command: Command } {
  const bars = parseBarsText(text);
  if (!bars.length) throw new Error('Write at least one bar line ("bar N: notes").');
  const operations: BasicOperation[] = [];
  const measureIds = score.measures.map((m) => m.id);
  const missing = Math.max(0, ...bars.map((b) => b.bar)) - score.measures.length;
  for (let i = 0; i < missing; i++) {
    measureIds.push(createdBarId(requestId, operations.length));
    operations.push({ type: "appendMeasure" });
  }
  const written: (WrittenEvent & { id: string; line: string })[] = [];
  // The bar's first line (the first staff's main line) carries what belongs to the whole bar.
  const first = staffHandle(score, allStaves(score)[0].id);
  const isMain = (line: WrittenBar) => line.voice === 1 && (!line.staff || line.staff === first);
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
      // Bars added at the end take the last bar's meter.
      const meter = (score.measures[bar - 1] ?? score.measures.at(-1)!).meter;
      const parts = spelled(events, meter);
      const notes = parts.map(({ pitch, stack, duration, tie }) => ({
        pitch,
        ...(stack.length ? { stack } : {}),
        duration,
        tie,
      }));
      operations.push({ type: "replaceMeasure", measureId, events: notes, ...(voice > 1 || staff ? { voiceId } : {}) });
      parts.forEach((event, k) => written.push({ ...event, line: voiceId, id: createdNoteId(requestId, index, k) }));
    } else {
      operations.push({ type: "clearMeasure", measureId, voiceId });
    }
    const hadSection = !!score.measures.find((m) => m.id === measureId)?.section;
    if (isMain(line) && (section || hadSection)) operations.push({ type: "setSection", measureId, label: section });
  }
  for (const [bar, chords] of harmonyByBar(bars, isMain)) {
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
