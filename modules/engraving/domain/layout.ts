import { beats, durationNotation, measureCapacity, measureStarts, meterName, staffPosition, type Meter, type Score, type ScoreEvent } from "../../score/domain/score";

export type EngravedEvent = {
  event: ScoreEvent; x: number; y: number; beat: number; localBeat: number; measure: number;
  stemDown: boolean; stemEnd: number; ledgerLines: number[]; accidental: number | null;
};
export type Beam = { x1: number; x2: number; y: number; level: number };
export type BarScene = { x: number; endX: number; number: number; id: string; meter: Meter; showMeter: boolean; beat: number; capacity: number; notesX: number; unit: number; repeatStart: boolean; repeatEnd: number | null; tempo?: number };
export type System = { top: number; firstMeasure: number; bars: BarScene[]; events: EngravedEvent[]; beams: Beam[]; beamedIds: string[]; labels: { id: string; annotationId: string; x: number; y: number; text: string; kind: "text" | "dynamic" }[] };
export const SCENE_WIDTH = 900;
export const STAFF_GAP = 12;
export const SYSTEM_HEIGHT = 230;

export function layoutScore(score: Score) {
  const systems: System[] = [];
  const starts = measureStarts(score);
  let nextTop = 90;
  for (let offset = 0; offset < score.measures.length; offset += 2) {
    const ids = new Set(score.measures.slice(offset, offset + 2).flatMap((m) => [m.id, ...m.events.map((e) => e.id)]));
    const text = score.annotations.filter((a) => ids.has(a.targetId) && a.kind === "text");
    const textRows = text.reduce((n, a) => n + Math.ceil(a.text.length / 38), 0);
    const top = nextTop + textRows * 15;
    const system: System = { top, firstMeasure: offset, bars: [], events: [], beams: [], beamedIds: [], labels: [] };
    for (let index = 0; index < 2 && offset + index < score.measures.length; index++) {
      const measure = score.measures[offset + index];
      const firstWidth = score.measures[offset].width ?? 364;
      const width = index === 0 ? firstWidth : 728 - firstWidth;
      const left = index === 0 ? 112 : 112 + firstWidth;
      const showMeter = index === 0 || meterName(measure.meter) !== meterName(score.measures[offset + index - 1].meter);
      const notesX = left + 28 + (index > 0 && showMeter ? 32 : 0) + (score.repeats.some((r) => r.startMeasureId === measure.id) ? 12 : 0);
      const capacity = measureCapacity(measure.meter), unit = (left + width - 34 - notesX) / capacity;
      system.bars.push({ x: left, endX: left + width - 4, number: offset + index + 1, id: measure.id, meter: measure.meter, showMeter, beat: starts[offset + index], capacity, notesX, unit, repeatStart: score.repeats.some((r) => r.startMeasureId === measure.id), repeatEnd: score.repeats.find((r) => r.endMeasureId === measure.id)?.count ?? null, tempo: measure.tempo });
      let onset = 0;
      const accidentalState = new Map<string, number>();
      for (const event of measure.events) {
        const position = event.pitch ? staffPosition(event.pitch) - 30 : 4;
        const y = top + 48 - position * 6;
        const ledgerLines: number[] = [];
        for (let line = -2; line >= position; line -= 2) ledgerLines.push(top + 48 - line * 6);
        for (let line = 10; line <= position; line += 2) ledgerLines.push(top + 48 - line * 6);
        const stemDown = position >= 4;
        let accidental: number | null = null;
        if (event.pitch) {
          const key = `${event.pitch.step}${event.pitch.octave}`;
          if ((accidentalState.get(key) ?? 0) !== event.pitch.alter) accidental = event.pitch.alter;
          accidentalState.set(key, event.pitch.alter);
        }
        system.events.push({ event, x: event.measureRest ? (left + left + width - 4) / 2 : notesX + onset * unit, y, beat: starts[offset + index] + onset, localBeat: onset, measure: offset + index, stemDown, stemEnd: y + (stemDown ? 38 : -38), ledgerLines, accidental });
        onset += beats(event.duration);
      }
    }
    for (const bar of system.bars) {
      const events = system.events.filter((e) => e.measure === bar.number - 1);
      const groupLength = bar.meter.denominator === 8 && bar.meter.numerator % 3 === 0 ? 1.5 : 1;
      let group: EngravedEvent[] = [];
      const flush = () => {
        if (group.length >= 2) {
          const down = group.reduce((sum, e) => sum + e.y, 0) / group.length <= top + 24;
          const end = down ? Math.max(...group.map((e) => e.y)) + 38 : Math.min(...group.map((e) => e.y)) - 38;
          group.forEach((e) => { e.stemDown = down; e.stemEnd = end; system.beamedIds.push(e.event.id); });
          const stemX = (e: EngravedEvent) => e.x + (down ? -6 : 6);
          system.beams.push({ x1: stemX(group[0]), x2: stemX(group.at(-1)!), y: end, level: 1 });
          group.forEach((e, i) => {
            if (durationNotation(e.event.duration).base !== 0.25) return;
            const next = group[i + 1], previous = group[i - 1];
            if (next && durationNotation(next.event.duration).base === 0.25) system.beams.push({ x1: stemX(e), x2: stemX(next), y: end + (down ? -7 : 7), level: 2 });
            else if (!previous || durationNotation(previous.event.duration).base !== 0.25) system.beams.push({ x1: stemX(e), x2: stemX(e) + (next ? 10 : -10), y: end + (down ? -7 : 7), level: 2 });
          });
        }
        group = [];
      };
      for (const event of events) {
        if (!event.event.pitch || durationNotation(event.event.duration).base > 0.5) { flush(); continue; }
        if (group.length && Math.floor(event.localBeat / groupLength) !== Math.floor(group[0].localBeat / groupLength)) flush();
        group.push(event);
      }
      flush();
    }
    let textRow = 0, dynamicRow = 0;
    for (const annotation of score.annotations.filter((a) => ids.has(a.targetId))) {
      const event = system.events.find((e) => e.event.id === annotation.targetId);
      const bar = system.bars.find((b) => b.id === annotation.targetId);
      const x = event?.x ?? bar!.notesX;
      if (annotation.kind === "dynamic") system.labels.push({ id: annotation.id, annotationId: annotation.id, x, y: top + 130 + dynamicRow++ * 17, text: annotation.text, kind: annotation.kind });
      else {
        const lines = annotation.text.match(/.{1,38}/g) ?? [];
        lines.forEach((line, i) => system.labels.push({ id: `${annotation.id}-${i}`, annotationId: annotation.id, x: Math.min(x, 580), y: top - 70 - textRows * 15 + textRow++ * 15, text: line, kind: "text" }));
      }
    }
    systems.push(system);
    nextTop = top + SYSTEM_HEIGHT + dynamicRow * 17;
  }
  return { width: SCENE_WIDTH, height: nextTop - 15, systems };
}
