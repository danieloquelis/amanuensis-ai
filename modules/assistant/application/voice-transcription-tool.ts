import {
  measureCapacity,
  parseChordSymbol,
  pitchName,
  type BasicOperation,
  type Meter,
  type Operation,
  type Pitch,
  type Score,
} from "@/modules/score";
import {
  hearingOf,
  reportTempo,
  segmentNotes,
  spanFrames,
  spanSignal,
  transcribeSpans,
  type ChordContext,
  type Hearing,
  type PitchFrame,
  type VoiceTake,
} from "@/modules/voice";
import { transcribeSchema } from "./music-tool-schemas";

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** How a tool may change the score: through the same validated, undoable path as score_edit. */
export type ScoreAccess = { getScore: () => Score; commit: (operation: Operation) => ToolResult };

const FOUR_FOUR: Meter = { numerator: 4, denominator: 4 };
type WrittenBar = { pitch: Pitch | null; duration: number; tie?: boolean }[];

/** "r/0.5 E4/0.5 G4/1~": a bar as compact text, cheap for the model to read; ~ ties into the next note. */
const barText = (bar: WrittenBar) =>
  bar.map((e) => `${e.pitch ? pitchName(e.pitch) : "r"}/${e.duration}${e.tie ? "~" : ""}`).join(" ");

/**
 * Hears each sung span and writes it into the score from the bar it was meant for (the musician
 * often says so: "in the second bar…"). Writing goes through score edits, so the whole turn
 * stays one undo step. Returns compact bars and the ear's evidence for the agent's review.
 */
export function transcribeIntoScore(take: VoiceTake | null, raw: unknown, access: ScoreAccess | null): ToolResult {
  const args = transcribeSchema.parse(raw);
  const score = access?.getScore();
  const firstBar = args.spans[0].bar ?? (score ? lastBarWithNotes(score) + 1 : 1);
  const meter = args.meter ?? score?.measures[firstBar - 1]?.meter ?? score?.measures.at(-1)?.meter ?? FOUR_FOUR;
  const capacity = measureCapacity(meter);
  const chords = (args.chords ?? []).map(({ bar, beat, symbol }): ChordContext => {
    const chord = parseChordSymbol(symbol);
    if (!chord) throw new Error(`"${symbol}" is not a chord symbol I know.`);
    return { beat: (bar - 1) * capacity + beat, ...chord };
  });
  const heardSpans = args.spans.map(({ spanId, startBeat, bars }) => {
    const signal = take && spanSignal(take, spanId);
    if (!signal) throw new Error(`There is no sung span ${spanId}${take ? "" : " (no voice take this turn)"}.`);
    return { signal, startBeat, bars, frames: spanFrames(take, spanId)! };
  });
  const { key, snapToChordTones } = args;
  // The score's tempo is the piece's tempo: a hint the singing is read around.
  const heardTempo = args.bpm === undefined ? tempoOfSinging(heardSpans, capacity, score?.tempo) : null;
  const bpm = args.bpm ?? heardTempo!.bpm;
  const starts = barsInOrder(args.spans, heardSpans, firstBar, bpm, capacity);
  const placed = heardSpans.map((span, i) => ({ ...span, bar: starts[i] }));
  const results = transcribeSpans(placed, { bpm, meter, key, chords, snapToChordTones });
  const kept = results.map((result, i) => keptBars(result.bars, placed[i], starts[i + 1]));
  const written = kept.flatMap((bars, i) => bars.map((events, offset) => ({ bar: starts[i] + offset, events })));
  const spans = results.map((result, i) => {
    const { spanId } = args.spans[i];
    const bar = starts[i];
    const at = (relative: number) => relative + bar - 1;
    return {
      spanId,
      bars: Object.fromEntries(kept[i].map((events, offset) => [`bar ${bar + offset}`, barText(events)])),
      ...(kept[i].length < result.bars.length ? { trimmedBars: result.bars.length - kept[i].length } : {}),
      heard: describeHearing(hearingOf(result.notes)),
      startBeat: result.startBeat,
      ...(result.startBeatSure ? {} : { startBeatGuessed: true }),
      tempo: `${result.tempoDrift[0]}–${result.tempoDrift[1]} BPM, following the singing`,
      evidence: result.evidence.map((e) => {
        const similar = e.similarRhythm.length ? `, rhythm like bar ${e.similarRhythm.map(at)}` : "";
        return `bar ${at(e.bar)}: ${e.confidence}, ${e.offCents} cents off, ${e.corrected} corrected${similar}`;
      }),
      doubtful: result.uncertain.map(
        (u) => `bar ${at(u.bar)} beat ${u.beat}: ${pitchName(u.written)} or ${pitchName(u.alternative)}`,
      ),
      ...(result.warnings.length ? { warnings: result.warnings } : {}),
    };
  });
  const transposed = results[0]?.transposedBy ? { transposedBySemitones: results[0].transposedBy } : {};
  const tempo = heardTempo && {
    tempo: {
      bpm,
      readFrom: "the singing",
      alternatives: heardTempo.alternatives.map((a) => `${a.bpm} BPM: ${a.fit} from the timing alone`),
    },
  };
  if (!args.write || !access) return { ok: true, ...tempo, ...transposed, spans, written: false };
  const commit = writeBars(access, written);
  return commit.ok ? { ok: true, ...tempo, ...transposed, spans, written: true, changes: commit.changes } : commit;
}

/**
 * The tempo of all the sung spans together, read with a drifting beat; the bars they were said
 * to fill settle double or half time.
 */
function tempoOfSinging(spans: { frames: PitchFrame[]; bars?: number }[], barBeats: number, hint?: number) {
  const onsets = spans.map(({ frames }) => segmentNotes(frames).map((note) => note.start));
  const bars = spans.every((span) => span.bars) ? spans.reduce((sum, span) => sum + span.bars!, 0) : undefined;
  // Spans are read one by one, so a total bar count only applies when there is a single span.
  return reportTempo(onsets, { barBeats, bpm: hint, bars: spans.length === 1 ? bars : undefined });
}

/** The last bar (from 1) that has a note in it; 0 for a score of rests. */
const lastBarWithNotes = (score: Score) =>
  score.measures.findLastIndex((measure) => measure.events.some((event) => event.pitch !== null)) + 1;

/**
 * Where each span starts: the bar asked for, or right after the previous span. A span fills the
 * bars it was said to, or as many as its length takes at the tempo.
 */
function barsInOrder(
  asked: { bar?: number; bars?: number }[],
  spans: { signal: { samples: Float32Array; sampleRate: number } }[],
  firstBar: number,
  bpm: number,
  barBeats: number,
): number[] {
  let next = firstBar;
  return asked.map((span, i) => {
    const bar = span.bar ?? next;
    const seconds = spans[i].signal.samples.length / spans[i].signal.sampleRate;
    next = bar + (span.bars ?? Math.max(1, Math.round((seconds * bpm) / 60 / barBeats)));
    return bar;
  });
}

/** "clear", or "hard to hear (11 of 21 notes unclear)" when the agent should not trust it. */
const describeHearing = ({ quality, unclear, notes }: Hearing) =>
  quality === "clear" ? quality : `${quality} (${unclear} of ${notes} notes unclear)`;

/** A trailing bar with less than this many beats of notes is the voice trailing off, not music. */
const TAIL_BEATS = 1;

/**
 * The bars a span may fill: as many as the agent said, else up to the next span's bar. A last
 * bar holding only a scrap of sound is dropped.
 */
function keptBars(bars: WrittenBar[], span: { bar: number; bars?: number }, nextBar?: number): WrittenBar[] {
  const limit = span.bars ?? (nextBar !== undefined ? nextBar - span.bar : bars.length);
  const kept = bars.slice(0, Math.max(1, limit));
  const noteBeats = (bar: WrittenBar) => bar.reduce((sum, e) => sum + (e.pitch ? e.duration : 0), 0);
  while (kept.length > 1 && noteBeats(kept.at(-1)!) < TAIL_BEATS) kept.pop();
  // The sound ends with the kept bars: a tie must not reach into whatever the score holds next.
  const last = kept.at(-1)!.map((e, i, bar) => (i === bar.length - 1 ? { pitch: e.pitch, duration: e.duration } : e));
  return [...kept.slice(0, -1), last];
}

/** Appends bars the take needs, then replaces each target bar with what was heard. */
function writeBars(access: ScoreAccess, bars: { bar: number; events: WrittenBar }[]): ToolResult {
  const needed = Math.max(...bars.map((b) => b.bar)) - access.getScore().measures.length;
  if (needed > 0) {
    const appended = access.commit({
      type: "batch",
      operations: Array.from({ length: needed }, (): BasicOperation => ({ type: "appendMeasure" })),
    });
    if (!appended.ok) return appended;
  }
  const measures = access.getScore().measures;
  return access.commit({
    type: "batch",
    operations: bars.map(
      ({ bar, events }) => ({ type: "replaceMeasure", measureId: measures[bar - 1].id, events }) as BasicOperation,
    ),
  });
}
