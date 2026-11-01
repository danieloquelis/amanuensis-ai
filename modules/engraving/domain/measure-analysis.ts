import {
  barEvents,
  barStyle,
  beatGroupLength,
  durationNotation,
  isNote,
  measureCapacity,
  measureStarts,
  meterName,
  voiceBars,
  type KeySignature,
  type MarkKind,
  type Measure,
  type Score,
  type ScoreEvent,
} from "@/modules/score";
import { headPositions, layoutChord, type ChordHead } from "./chord-heads";
import { onsetColumns, type Column } from "./columns";
import { eventExtents } from "./spacing";
import { analyzeEvents, groupStemsDown } from "./event-analysis";
import { resolveCollisions } from "./voice-layout";

/** Everything about an event that does not depend on horizontal placement. */
export type AnalyzedEvent = {
  event: ScoreEvent;
  /** The event's voice on its staff, from 1 (the main line). */
  voice: number;
  voiceId: string;
  /** The staff it is on, counted down the system from 0. */
  staff: number;
  /** Other voices share its staff in this bar: stems and curves keep to each voice's side. */
  shared: boolean;
  localBeat: number;
  /** Steps above the bottom staff line. Rests sit on the middle line, or off it when voices share the staff. */
  position: number;
  accidental: number | null;
  stemDown: boolean;
  /** Index into `AnalyzedBar.beamGroups`, or null when unbeamed. */
  beamGroup: number | null;
  /** Ink left and right of the event's x, accidental included. */
  left: number;
  right: number;
  /** How far the head sits right of its column, beside another voice's head a second away. */
  xShift: number;
  /** How far further left its accidental sits, beside another accidental in the column. */
  accidentalShift: number;
  /** A chord's heads, lowest first (`position` is the lowest); absent for a single note. */
  heads?: ChordHead[];
};

export type AnalyzedBar = {
  measure: Measure;
  index: number;
  beat: number;
  capacity: number;
  events: AnalyzedEvent[];
  /** Event indexes beamed together. */
  beamGroups: number[][];
  /** Events grouped by onset, in time order: what horizontal spacing works on. */
  columns: Column[];
  /** More than one voice plays in the bar, on any staff: a whole-bar rest is then centred on its own. */
  polyphonic: boolean;
  measureRest: boolean;
  /** True when this bar needs a time signature (first bar or a change). */
  meterChanges: boolean;
  repeatStart: boolean;
  repeatEnd: number | null;
  style: "slashes" | "repeat" | null;
  marks: { id: string; kind: MarkKind }[];
  repeatStartId: string | null;
  repeatEndId: string | null;
};

/** Every bar, all staves; `staffKeys` are the keys each staff is written in (transposing parts differ). */
export function analyzeScore(score: Score, staffKeys: Map<string, KeySignature> = new Map()): AnalyzedBar[] {
  const starts = measureStarts(score);
  return score.measures.map((measure, index) => {
    const previous = score.measures[index - 1];
    const polyphonic = voiceBars(measure).length > 1;
    const events = analyzeEvents(score, measure, staffKeys);
    // Beams join notes of one voice; where voices share a staff, each voice's stems keep their side.
    const voices = [...new Set(events.map((item) => item.voiceId))];
    const beamGroups = voices.flatMap((voice) => findBeamGroups(measure, events, voice));
    beamGroups.forEach((group, groupIndex) => {
      const down = events[group[0]].shared
        ? events[group[0]].stemDown
        : groupStemsDown(group.flatMap((i) => headPositions(events[i])));
      for (const i of group) Object.assign(events[i], { beamGroup: groupIndex, stemDown: down });
    });
    for (const item of events) Object.assign(item, eventExtents(item));
    events.forEach(layoutChord);
    resolveCollisions(events);
    for (const item of events) item.left += item.accidentalShift;
    const capacity = measureCapacity(measure.meter);
    return {
      measure,
      index,
      beat: starts[index],
      capacity,
      events,
      beamGroups,
      columns: onsetColumns(events, capacity),
      polyphonic,
      // A whole-bar rest is centred only when its voice is alone in the bar.
      measureRest: !polyphonic && isMeasureRest(barEvents(measure)),
      meterChanges: !previous || meterName(previous.meter) !== meterName(measure.meter),
      repeatStart: score.repeats.some((r) => r.startMeasureId === measure.id),
      repeatEnd: score.repeats.find((r) => r.endMeasureId === measure.id)?.count ?? null,
      style: barStyle(measure) ?? null,
      marks: score.marks.filter((m) => m.measureId === measure.id).map(({ id, kind }) => ({ id, kind })),
      repeatStartId: score.repeats.find((r) => r.startMeasureId === measure.id)?.id ?? null,
      repeatEndId: score.repeats.find((r) => r.endMeasureId === measure.id)?.id ?? null,
    };
  });
}

const isMeasureRest = (events: ScoreEvent[]) => events.length === 1 && Boolean(events[0].measureRest);

/**
 * One voice's consecutive eighths and shorter, within one beat group (a dotted quarter in compound
 * time). A triplet's members beam among themselves, across a beat too (a quarter-note triplet's eighths).
 */
function findBeamGroups(measure: Measure, events: AnalyzedEvent[], voiceId: string): number[][] {
  const groupLength = beatGroupLength(measure.meter);
  const groups: number[][] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
  };
  events.forEach((item, index) => {
    if (item.voiceId !== voiceId) return;
    const beamable = isNote(item.event) && durationNotation(item.event.duration).base <= 0.5;
    if (!beamable) return flush();
    const group = (at: AnalyzedEvent) =>
      at.event.tuplet ? `triplet ${at.event.tuplet.id}` : `beat ${Math.floor(at.localBeat / groupLength)}`;
    if (current.length && group(item) !== group(events[current[0]])) flush();
    current.push(index);
  });
  flush();
  return groups;
}
