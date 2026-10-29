import {
  barEvents,
  barStyle,
  beatGroupLength,
  durationNotation,
  eventOnsets,
  isNote,
  keyAlter,
  measureCapacity,
  measureStarts,
  meterName,
  scoreKey,
  soundingBeats,
  staffPosition,
  type MarkKind,
  type Measure,
  type Score,
  type ScoreEvent,
} from "@/modules/score";
import { CLEF_BOTTOM_LINE, staffClef } from "./clefs";
import { MIDDLE_LINE } from "./scene";
import { eventExtents, springFor } from "./spacing";

/** Everything about an event that does not depend on horizontal placement. */
export type AnalyzedEvent = {
  event: ScoreEvent;
  localBeat: number;
  /** Steps above the bottom staff line. Rests sit on the middle line. */
  position: number;
  accidental: number | null;
  stemDown: boolean;
  /** Index into `AnalyzedBar.beamGroups`, or null when unbeamed. */
  beamGroup: number | null;
  left: number;
  right: number;
  /** Ideal space from this event to the next one at stretch 1. */
  spring: number;
};

export type AnalyzedBar = {
  measure: Measure;
  index: number;
  beat: number;
  capacity: number;
  events: AnalyzedEvent[];
  /** Event indexes beamed together. */
  beamGroups: number[][];
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

export function analyzeScore(score: Score): AnalyzedBar[] {
  const starts = measureStarts(score);
  return score.measures.map((measure, index) => {
    const previous = score.measures[index - 1];
    const events = analyzeEvents(score, measure);
    const beamGroups = findBeamGroups(measure, events);
    beamGroups.forEach((group, groupIndex) => {
      const down = groupStemsDown(group.map((i) => events[i].position));
      for (const i of group) Object.assign(events[i], { beamGroup: groupIndex, stemDown: down });
    });
    for (const item of events) Object.assign(item, eventExtents(item));
    return {
      measure,
      index,
      beat: starts[index],
      capacity: measureCapacity(measure.meter),
      events,
      beamGroups,
      measureRest: isMeasureRest(barEvents(measure)),
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

/** Positions and accidentals; an accidental holds for its staff position until the barline. */
function analyzeEvents(score: Score, measure: Measure): AnalyzedEvent[] {
  const key = scoreKey(score);
  const bottomLine = CLEF_BOTTOM_LINE[staffClef(score)];
  const alterations = new Map<string, number>();
  const events = barEvents(measure);
  const onsets = eventOnsets(events);
  return events.map((event, index) => {
    const position = event.pitch ? staffPosition(event.pitch) - bottomLine : MIDDLE_LINE;
    let accidental: number | null = null;
    if (event.pitch) {
      const at = `${event.pitch.step}${event.pitch.octave}`;
      const current = alterations.get(at) ?? keyAlter(key, event.pitch.step);
      if (current !== event.pitch.alter) accidental = event.pitch.alter;
      alterations.set(at, event.pitch.alter);
    }
    const item: AnalyzedEvent = {
      event,
      localBeat: onsets[index],
      position,
      accidental,
      stemDown: position >= MIDDLE_LINE,
      beamGroup: null,
      left: 0,
      right: 0,
      spring: springFor(soundingBeats(event)),
    };
    return item;
  });
}

/** Consecutive eighths and shorter, within one beat group (a dotted quarter in compound time). */
function findBeamGroups(measure: Measure, events: AnalyzedEvent[]): number[][] {
  const groupLength = beatGroupLength(measure.meter);
  const groups: number[][] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
  };
  events.forEach((item, index) => {
    const beamable = isNote(item.event) && durationNotation(item.event.duration).base <= 0.5;
    if (!beamable) return flush();
    const beatGroup = (beat: number) => Math.floor(beat / groupLength);
    if (current.length && beatGroup(item.localBeat) !== beatGroup(events[current[0]].localBeat)) flush();
    current.push(index);
  });
  flush();
  return groups;
}

/** The note farthest from the middle line decides; a tie goes down. */
function groupStemsDown(positions: number[]): boolean {
  const above = Math.max(...positions.map((p) => p - MIDDLE_LINE));
  const below = Math.max(...positions.map((p) => MIDDLE_LINE - p));
  return above >= below;
}
