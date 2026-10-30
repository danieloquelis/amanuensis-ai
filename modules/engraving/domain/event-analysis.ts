import {
  eventOnsets,
  eventPitches,
  keyAlter,
  scoreKey,
  staffPosition,
  voiceBars,
  voiceInfo,
  type KeySignature,
  type Measure,
  type Score,
} from "@/modules/score";
import { CLEF_BOTTOM_LINE } from "./clefs";
import type { AnalyzedEvent } from "./measure-analysis";
import { MIDDLE_LINE } from "./scene";
import { restPosition, stemsDown } from "./voice-layout";

/** The note farthest from the middle line decides; a tie goes down. */
export function groupStemsDown(positions: number[]): boolean {
  const above = Math.max(...positions.map((p) => p - MIDDLE_LINE));
  const below = Math.max(...positions.map((p) => MIDDLE_LINE - p));
  return above >= below;
}

/**
 * Every voice's events in a bar, on their own staff: positions from the staff's clef, stems and
 * rests set apart where voices share a staff, and accidentals. An accidental holds for its staff
 * position until the barline on that staff, whichever voice it is in, in the order notes are played,
 * against the staff's (written) key.
 */
export function analyzeEvents(score: Score, measure: Measure, staffKeys: Map<string, KeySignature>): AnalyzedEvent[] {
  const bars = voiceBars(measure).map((bar) => ({ bar, info: voiceInfo(score, bar.voiceId)! }));
  const voicesOnStaff = (staffIndex: number) => bars.filter(({ info }) => info.staffIndex === staffIndex).length;
  const events = bars.flatMap(({ bar, info }) => {
    const voice = info.voiceIndex + 1;
    const shared = voicesOnStaff(info.staffIndex) > 1;
    const bottomLine = CLEF_BOTTOM_LINE[info.staff.clef];
    const onsets = eventOnsets(bar.events);
    return bar.events.map((event, index): AnalyzedEvent => {
      const position = event.pitch ? staffPosition(event.pitch) - bottomLine : restPosition(event, voice, shared);
      const chord = event.stack
        ? eventPitches(event).map((p) => ({
            position: staffPosition(p) - bottomLine,
            accidental: null,
            dx: 0,
            accidentalShift: 0,
          }))
        : undefined;
      const extremes = chord ? chord.map((h) => h.position) : [position];
      return {
        event,
        voice,
        voiceId: bar.voiceId,
        staff: info.staffIndex,
        shared,
        localBeat: onsets[index],
        position,
        accidental: null,
        // A lone chord's stem is set by its note farthest from the middle line.
        stemDown: shared ? stemsDown(voice) : groupStemsDown(extremes),
        ...(chord ? { heads: chord } : {}),
        beamGroup: null,
        left: 0,
        right: 0,
        xShift: 0,
        accidentalShift: 0,
      };
    });
  });
  const alterations = new Map<string, number>();
  const played = [...events].sort((a, b) => a.localBeat - b.localBeat || a.staff - b.staff || a.voice - b.voice);
  for (const item of played) {
    const staff = bars.find(({ bar }) => bar.voiceId === item.voiceId)!.info.staff;
    const key = staffKeys.get(staff.id) ?? scoreKey(score);
    eventPitches(item.event).forEach((pitch, k) => {
      const at = `${item.staff}:${pitch.step}${pitch.octave}`;
      const current = alterations.get(at) ?? keyAlter(key, pitch.step);
      const accidental = current !== pitch.alter ? pitch.alter : null;
      alterations.set(at, pitch.alter);
      if (item.heads) item.heads[k].accidental = accidental;
      else item.accidental = accidental;
    });
  }
  return events;
}
