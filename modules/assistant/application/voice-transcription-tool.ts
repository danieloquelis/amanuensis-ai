import {
  describeReadability,
  measureCapacity,
  readability,
  parseChordSymbol,
  durationCode,
  pitchName,
  pitchText,
  type Meter,
  type Operation,
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
import {
  barsInOrder,
  keptBars,
  lastBarWithNotes,
  lineOf,
  nextStartsOfLine,
  placeKey,
  registerOf,
  staleBars,
  writeBars,
  type SpanPlaces,
  type WrittenBar,
} from "./transcription-placement";

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** How a tool may change the score: through the same validated, undoable path as score_edit. */
export type ScoreAccess = { getScore: () => Score; commit: (operation: Operation) => ToolResult };

const FOUR_FOUR: Meter = { numerator: 4, denominator: 4 };

/** " v2" after a bar number for a line other than the main one, as score text names it. */
const lineName = (voice: string | undefined) => (lineOf(voice) === "v1" ? "" : ` ${lineOf(voice).replace("/", " ")}`);

/** "re E4e G4q~": a bar in score text, as the agent reads and writes the score. */
const barText = (bar: WrittenBar) =>
  bar.map((e) => `${e.pitch ? pitchText(e.pitch) : "r"}${durationCode(e.duration)}${e.tie ? "~" : ""}`).join(" ");

/**
 * Hears each sung span and writes it into the score from the bar it was meant for (the musician
 * often says so: "in the second bar…"). Writing goes through score edits, so the whole turn
 * stays one undo step. Returns compact bars and the ear's evidence for the agent's review.
 */
export function transcribeIntoScore(
  take: VoiceTake | null,
  raw: unknown,
  access: ScoreAccess | null,
  places: SpanPlaces = new Map(),
): ToolResult {
  const args = transcribeSchema.parse(raw);
  const score = access?.getScore();
  const firstLine = lineOf(args.spans[0].voice);
  // A span already written this turn goes back where it was, replacing that reading.
  const earlier = places.get(placeKey(args.spans[0].spanId, firstLine));
  const firstBar = args.spans[0].bar ?? earlier?.bar ?? (score ? lastBarWithNotes(score, firstLine) + 1 : 1);
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
  // The singing written at a tempo: where each span starts, what was heard, the bars it fills.
  const readAt = (tempo: number) => {
    const starts = barsInOrder(args.spans, heardSpans, { firstBar, score }, tempo, capacity);
    // A second voice is a lower line (a bass under the melody): it is written low.
    const placed = heardSpans.map((span, i) => ({
      ...span,
      bar: starts[i],
      register: registerOf(score, lineOf(args.spans[i].voice)),
    }));
    const results = transcribeSpans(placed, { bpm: tempo, meter, key, chords, snapToChordTones });
    const nexts = nextStartsOfLine(args.spans, starts);
    return { starts, results, kept: results.map((result, i) => keptBars(result.bars, placed[i], nexts[i])) };
  };
  // How each reading would look on the page, so the plainest of those that fit can be chosen.
  const reads = (bars: WrittenBar[]) => describeReadability(readability(bars, meter));
  const { starts, results, kept } = readAt(bpm);
  const written = kept.flatMap((bars, i) =>
    bars.map((events, offset) => ({ bar: starts[i] + offset, line: lineOf(args.spans[i].voice), events })),
  );
  const spans = results.map((result, i) => {
    const { spanId } = args.spans[i];
    const bar = starts[i];
    const at = (relative: number) => relative + bar - 1;
    return {
      spanId,
      bars: Object.fromEntries(
        kept[i].map((events, offset) => [`bar ${bar + offset}${lineName(args.spans[i].voice)}`, barText(events)]),
      ),
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
      ...(result.triplets.length
        ? {
            soundsLikeTriplets: result.triplets.map(
              (t) => `bar ${at(t.bar)} beat ${t.beat + 1}: three even notes, written straight (a triplet is 3[…])`,
            ),
          }
        : {}),
      ...(result.warnings.length ? { warnings: result.warnings } : {}),
    };
  });
  const transposed = results[0]?.transposedBy ? { transposedBySemitones: results[0].transposedBy } : {};
  const tempo = heardTempo && {
    tempo: {
      bpm,
      readFrom: "the singing",
      reads: reads(kept.flat()),
      alternatives: heardTempo.alternatives.map((a) => {
        const looks = a.fit === "unlikely" ? "" : `; would read ${reads(readAt(a.bpm).kept.flat())}`;
        return `${a.bpm} BPM: ${a.fit} from the timing alone${looks}`;
      }),
    },
  };
  if (!args.write || !access) return { ok: true, ...tempo, ...transposed, spans, written: false };
  const commit = writeBars(access, written);
  if (!commit.ok) return commit;
  const now = args.spans.map(({ spanId, voice }, i) => ({
    spanId,
    line: lineOf(voice),
    bar: starts[i],
    bars: kept[i].length,
  }));
  const stale = staleBars(places, now);
  if (stale.length) {
    const cleared = access.commit({
      type: "batch",
      operations: stale.map(({ bar, line }) => ({
        type: "clearMeasure",
        measureId: access.getScore().measures[bar - 1].id,
        voiceId: line,
      })),
    });
    if (!cleared.ok) return cleared;
  }
  for (const span of now) places.set(placeKey(span.spanId, span.line), { bar: span.bar, bars: span.bars });
  return { ok: true, ...tempo, ...transposed, spans, written: true, changes: commit.changes };
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

/** "clear", or "hard to hear (11 of 21 notes unclear)" when the agent should not trust it. */
const describeHearing = ({ quality, unclear, notes }: Hearing) =>
  quality === "clear" ? quality : `${quality} (${unclear} of ${notes} notes unclear)`;
