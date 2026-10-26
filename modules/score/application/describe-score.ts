import { CHORD_QUALITY_NAMES, formatChord } from "../domain/chords";
import { keyName, scoreKey } from "../domain/key";
import { MARK_KINDS, MARK_LABELS } from "../domain/navigation";
import { ARTICULATIONS, DYNAMICS } from "../domain/notation";
import { pitchName } from "../domain/pitch";
import { beats, DURATIONS, meterName, METERS } from "../domain/rhythm";
import type { Score, ScoreEvent } from "../domain/schema";

const durationName = (event: ScoreEvent) =>
  event.measureRest
    ? "whole bar"
    : (DURATIONS.find((d) => d.value === beats(event.duration))?.label.toLowerCase() ?? "");

/**
 * A compact, readable view of a score for language models: bars numbered from 1, beats counted
 * from 1, pitch names, duration names and chord symbols, each with the stable ID that operations
 * take. Written for reasoning; the raw score remains the source of truth.
 */
export function describeScore(score: Score) {
  const barNumber = (measureId: string) => score.measures.findIndex((m) => m.id === measureId) + 1;
  const anchorOf = (targetId: string) => {
    for (const [index, measure] of score.measures.entries()) {
      if (measure.id === targetId) return `bar ${index + 1}`;
      let beat = 1;
      for (const event of measure.events) {
        if (event.id === targetId) return `bar ${index + 1}, beat ${beat}`;
        beat += beats(event.duration);
      }
    }
    return "missing anchor";
  };
  return {
    title: score.title,
    revision: score.revision,
    key: keyName(scoreKey(score)),
    tempo: `${score.tempo} quarter-note BPM`,
    bars: score.measures.map((measure, index) => {
      let beat = 1;
      return {
        bar: index + 1,
        id: measure.id,
        meter: meterName(measure.meter),
        ...(measure.section ? { section: measure.section } : {}),
        ...(measure.style ? { shows: measure.style === "slashes" ? "rhythm slashes" : "repeat of previous bar" } : {}),
        ...(measure.tempo ? { tempo: measure.tempo } : {}),
        events: measure.events.map((event) => {
          const entry = {
            id: event.id,
            beat,
            pitch: event.pitch ? pitchName(event.pitch) : "rest",
            duration: durationName(event),
            beats: beats(event.duration),
            ...(event.articulation ? { articulation: event.articulation } : {}),
          };
          beat += beats(event.duration);
          return entry;
        }),
        chords: score.chords
          .filter((c) => c.measureId === measure.id)
          .sort((a, b) => a.beat - b.beat)
          .map((c) => ({ id: c.id, beat: c.beat + 1, symbol: formatChord(c) })),
        marks: score.marks.filter((m) => m.measureId === measure.id).map((m) => ({ id: m.id, kind: m.kind })),
      };
    }),
    repeats: score.repeats.map((r) => ({
      id: r.id,
      fromBar: barNumber(r.startMeasureId),
      toBar: barNumber(r.endMeasureId),
      passes: r.count,
    })),
    indications: score.annotations.map((a) => ({ id: a.id, kind: a.kind, text: a.text, at: anchorOf(a.targetId) })),
  };
}

/** What the engine can write, so an agent never has to guess the vocabulary. */
export const SCORE_VOCABULARY = {
  units: "Durations and chord/mark positions are in quarter-note beats; operation `beat` fields count from 0.",
  meters: METERS,
  durations: DURATIONS.map((d) => ({ name: d.label.toLowerCase(), beats: d.value })),
  pitch: "{ step: C–B, alter: -1 flat | 0 | 1 sharp, octave: 3–6 }; C4 is middle C.",
  articulations: ARTICULATIONS,
  dynamics: DYNAMICS,
  chordQualities: CHORD_QUALITY_NAMES.map((q) => q || "(major triad)"),
  chordExamples: ["C", "Am7", "F#m7b5", "Bbmaj7/D", "G7#9", "Dsus4", "Eø", "C6/9"],
  marks: MARK_KINDS.map((kind) => ({ kind, label: MARK_LABELS[kind] })),
  barStyles: ["notes", "slashes", "repeat"],
};

/** One line per bar that changed between two revisions, for tool receipts. */
export function summarizeChange(before: Score, after: Score): string[] {
  const lines: string[] = [];
  const describeBefore = describeScore(before).bars;
  const describeAfter = describeScore(after).bars;
  for (const bar of describeAfter) {
    const previous = describeBefore.find((b) => b.id === bar.id);
    if (!previous) lines.push(`Bar ${bar.bar}: added`);
    else if (JSON.stringify(previous) !== JSON.stringify({ ...bar, bar: previous.bar }))
      lines.push(`Bar ${bar.bar}: changed`);
  }
  for (const bar of describeBefore) {
    if (!describeAfter.some((b) => b.id === bar.id)) lines.push(`Bar ${bar.bar} (${bar.id}): removed`);
  }
  if (before.title !== after.title) lines.push(`Title: ${after.title}`);
  if (before.tempo !== after.tempo) lines.push(`Tempo: ${after.tempo}`);
  if (JSON.stringify(before.key) !== JSON.stringify(after.key)) lines.push(`Key: ${keyName(scoreKey(after))}`);
  if (JSON.stringify(before.repeats) !== JSON.stringify(after.repeats)) lines.push("Repeats changed");
  if (JSON.stringify(before.annotations) !== JSON.stringify(after.annotations)) lines.push("Indications changed");
  return lines.length ? lines : ["No visible change"];
}
