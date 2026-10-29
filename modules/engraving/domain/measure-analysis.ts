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
  voiceBars,
  voiceNumber,
  staffPosition,
  type MarkKind,
  type Measure,
  type Score,
  type ScoreEvent,
} from "@/modules/score";
import { CLEF_BOTTOM_LINE, staffClef } from "./clefs";
import { onsetColumns, type Column } from "./columns";
import { MIDDLE_LINE } from "./scene";
import { eventExtents } from "./spacing";
import { resolveCollisions, restPosition, stemsDown } from "./voice-layout";

/** Everything about an event that does not depend on horizontal placement. */
export type AnalyzedEvent = {
  event: ScoreEvent;
  /** The event's voice on the staff, from 1 (the main line). */
  voice: number;
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
  /** More than one voice plays in the bar. */
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

export function analyzeScore(score: Score): AnalyzedBar[] {
  const starts = measureStarts(score);
  return score.measures.map((measure, index) => {
    const previous = score.measures[index - 1];
    const polyphonic = voiceBars(measure).length > 1;
    const events = analyzeEvents(score, measure, polyphonic);
    // Beams join notes of one voice; with several voices each voice's stems keep their side.
    const voices = [...new Set(events.map((item) => item.voice))];
    const beamGroups = voices.flatMap((voice) => findBeamGroups(measure, events, voice));
    beamGroups.forEach((group, groupIndex) => {
      const down = polyphonic ? events[group[0]].stemDown : groupStemsDown(group.map((i) => events[i].position));
      for (const i of group) Object.assign(events[i], { beamGroup: groupIndex, stemDown: down });
    });
    for (const item of events) Object.assign(item, eventExtents(item));
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
 * Every voice's events, with positions and accidentals. An accidental holds for its staff position
 * until the barline, whichever voice it is in, in the order the notes are played.
 */
function analyzeEvents(score: Score, measure: Measure, polyphonic: boolean): AnalyzedEvent[] {
  const key = scoreKey(score);
  const bottomLine = CLEF_BOTTOM_LINE[staffClef(score)];
  const events = voiceBars(measure).flatMap(({ voiceId, events: voiceEvents }) => {
    const voice = voiceNumber(score, voiceId);
    const onsets = eventOnsets(voiceEvents);
    return voiceEvents.map((event, index): AnalyzedEvent => {
      const position = event.pitch ? staffPosition(event.pitch) - bottomLine : restPosition(event, voice, polyphonic);
      return {
        event,
        voice,
        localBeat: onsets[index],
        position,
        accidental: null,
        stemDown: polyphonic ? stemsDown(voice) : position >= MIDDLE_LINE,
        beamGroup: null,
        left: 0,
        right: 0,
        xShift: 0,
        accidentalShift: 0,
      };
    });
  });
  const alterations = new Map<string, number>();
  const played = [...events].sort((a, b) => a.localBeat - b.localBeat || a.voice - b.voice);
  for (const item of played) {
    const pitch = item.event.pitch;
    if (!pitch) continue;
    const at = `${pitch.step}${pitch.octave}`;
    const current = alterations.get(at) ?? keyAlter(key, pitch.step);
    if (current !== pitch.alter) item.accidental = pitch.alter;
    alterations.set(at, pitch.alter);
  }
  return events;
}

/** One voice's consecutive eighths and shorter, within one beat group (a dotted quarter in compound time). */
function findBeamGroups(measure: Measure, events: AnalyzedEvent[], voice: number): number[][] {
  const groupLength = beatGroupLength(measure.meter);
  const groups: number[][] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
  };
  events.forEach((item, index) => {
    if (item.voice !== voice) return;
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
