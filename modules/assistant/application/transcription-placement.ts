import {
  barEvents,
  isNote,
  numberedVoice,
  type BasicOperation,
  type Operation,
  type Pitch,
  type Score,
} from "@/modules/score";

/**
 * Where sung spans go in the score: which bars of which line (voice) they fill, and the edits
 * that write them. A melody and a bass line sung in one take each count their bars on their own line.
 */

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
export type WrittenBar = { pitch: Pitch | null; duration: number; tie?: boolean }[];
type Access = { getScore: () => Score; commit: (operation: Operation) => ToolResult };

/** The line a span names: "v2" is 2; the main line, 1, when it names none. */
export const lineOf = (voice: string | undefined) => (voice ? Number(voice.slice(1)) : 1);

/** The last bar (from 1) with a note in this line; 0 when it has none. */
export function lastBarWithNotes(score: Score, line = 1): number {
  const voiceId = line === 1 ? undefined : numberedVoice(score, line);
  if (voiceId === null) return 0;
  return score.measures.findLastIndex((measure) => barEvents(measure, voiceId).some(isNote)) + 1;
}

/**
 * Where each span starts: the bar asked for, or right after the previous span of its line (the
 * first span of the main line: `firstBar`; of another line: after that line's last notes). A span
 * fills the bars it was said to, or as many as its length takes at the tempo.
 */
export function barsInOrder(
  asked: { bar?: number; bars?: number; voice?: string }[],
  spans: { signal: { samples: Float32Array; sampleRate: number } }[],
  start: { firstBar: number; score: Score | undefined },
  bpm: number,
  barBeats: number,
): number[] {
  const next = new Map<number, number>();
  return asked.map((span, i) => {
    const line = lineOf(span.voice);
    const after =
      line === lineOf(asked[0].voice) ? start.firstBar : (start.score ? lastBarWithNotes(start.score, line) : 0) + 1;
    const bar = span.bar ?? next.get(line) ?? after;
    const seconds = spans[i].signal.samples.length / spans[i].signal.sampleRate;
    next.set(line, bar + (span.bars ?? Math.max(1, Math.round((seconds * bpm) / 60 / barBeats))));
    return bar;
  });
}

/** For each span, where the next span of the same line starts, if any. */
export function nextStartsOfLine(asked: { voice?: string }[], starts: number[]): (number | undefined)[] {
  return asked.map((span, i) => {
    const later = asked.findIndex((other, j) => j > i && lineOf(other.voice) === lineOf(span.voice));
    return later === -1 ? undefined : starts[later];
  });
}

/** A trailing bar with less than this many beats of notes is the voice trailing off, not music. */
const TAIL_BEATS = 1;

/**
 * The bars a span may fill: as many as the agent said, else up to the next span's bar. A last
 * bar holding only a scrap of sound is dropped.
 */
export function keptBars(bars: WrittenBar[], span: { bar: number; bars?: number }, nextBar?: number): WrittenBar[] {
  const limit = span.bars ?? (nextBar !== undefined ? nextBar - span.bar : bars.length);
  const kept = bars.slice(0, Math.max(1, limit));
  const noteBeats = (bar: WrittenBar) => bar.reduce((sum, e) => sum + (e.pitch ? e.duration : 0), 0);
  while (kept.length > 1 && noteBeats(kept.at(-1)!) < TAIL_BEATS) kept.pop();
  // The sound ends with the kept bars: a tie must not reach into whatever the score holds next.
  const last = kept.at(-1)!.map((e, i, bar) => (i === bar.length - 1 ? { pitch: e.pitch, duration: e.duration } : e));
  return [...kept.slice(0, -1), last];
}

/** Appends bars the take needs, then replaces each target bar of its line with what was heard. */
export function writeBars(access: Access, bars: { bar: number; line: number; events: WrittenBar }[]): ToolResult {
  const needed = Math.max(...bars.map((b) => b.bar)) - access.getScore().measures.length;
  if (needed > 0) {
    const appended = access.commit({
      type: "batch",
      operations: Array.from({ length: needed }, (): BasicOperation => ({ type: "appendMeasure" })),
    });
    if (!appended.ok) return appended;
  }
  const measures = access.getScore().measures;
  // Another line gets its bars first (whole-bar rests), then each is written like the main line.
  const addLines = [...new Set(bars.filter((b) => b.line > 1).map((b) => b.line))].map((line): BasicOperation => ({
    type: "addVoiceBars",
    voice: line,
    measureIds: bars.filter((b) => b.line === line).map((b) => measures[b.bar - 1].id),
  }));
  // Heard durations are whole written values; the score validates them like any edit.
  const writes = bars.map(
    ({ bar, line, events }) =>
      ({
        type: "replaceMeasure",
        measureId: measures[bar - 1].id,
        events,
        ...(line > 1 ? { voiceId: `v${line}` } : {}),
      }) as BasicOperation,
  );
  return access.commit({ type: "batch", operations: [...addLines, ...writes] });
}
