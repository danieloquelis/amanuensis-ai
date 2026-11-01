import { DRUM_PIECE_CODES, DRUM_PIECES, drumNames } from "../domain/drums";
import { GROOVE_NAMES, GROOVES } from "../domain/grooves";
import { eventPitches } from "../domain/stacks";
import { INSTRUMENT_IDS, INSTRUMENTS } from "../domain/instruments";
import { CHORD_QUALITY_NAMES, formatChord } from "../domain/chords";
import { keyName, scoreKey } from "../domain/key";
import { MARK_KINDS, MARK_LABELS } from "../domain/navigation";
import { ARTICULATIONS, DYNAMICS } from "../domain/notation";
import { pitchName } from "../domain/pitch";
import { beats, DURATIONS, eventOnsets, meterName, METERS, soundingBeats } from "../domain/rhythm";
import type { Score, ScoreEvent } from "../domain/schema";
import { partHandles } from "../domain/handles";
import { barEvents, barStyle, voiceBars } from "../domain/voice-access";

/** "quarter", "dotted eighth", "triplet eighth" (a triplet's member is named by its written value). */
const durationName = (event: ScoreEvent) => {
  if (event.measureRest) return "whole bar";
  const name = DURATIONS.find((d) => d.value === beats(event.duration))?.label.toLowerCase() ?? "";
  return event.tuplet ? `triplet ${name}` : name;
};
/** Beats as a musician reads them: a triplet's thirds to two decimals (1.33), others exact. */
const rounded = (value: number) => Math.round(value * 100) / 100;

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
      const events = barEvents(measure);
      const onsets = eventOnsets(events);
      const at = events.findIndex((event) => event.id === targetId);
      if (at !== -1) return `bar ${index + 1}, beat ${rounded(onsets[at] + 1)}`;
    }
    return "missing anchor";
  };
  return {
    title: score.title,
    revision: score.revision,
    key: keyName(scoreKey(score)),
    tempo: `${score.tempo} quarter-note BPM`,
    bars: score.measures.map((measure, index) => {
      const onsets = eventOnsets(barEvents(measure));
      return {
        bar: index + 1,
        id: measure.id,
        meter: meterName(measure.meter),
        ...(measure.section ? { section: measure.section } : {}),
        ...(barStyle(measure)
          ? { shows: barStyle(measure) === "slashes" ? "rhythm slashes" : "repeat of previous bar" }
          : {}),
        ...(measure.tempo ? { tempo: measure.tempo } : {}),
        events: barEvents(measure).map((event, i) => ({
          id: event.id,
          beat: rounded(onsets[i] + 1),
          pitch: event.drums
            ? drumNames(event.drums)
            : event.pitch
              ? eventPitches(event).map(pitchName).join(" ")
              : "rest",
          duration: durationName(event),
          beats: rounded(soundingBeats(event)),
          ...(event.tuplet ? { tuplet: "3:2" } : {}),
          ...(event.articulation ? { articulation: event.articulation } : {}),
          ...(event.tie ? { tiedToNext: true } : {}),
        })),
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
    slurs: score.slurs.map((s) => ({
      id: s.id,
      from: anchorOf(s.startEventId),
      to: anchorOf(s.endEventId),
      ...(s.lift ? { lift: s.lift } : {}),
    })),
  };
}

/** What the engine can write, so an agent never has to guess the vocabulary. */
export const SCORE_VOCABULARY = {
  units: "Durations and chord/mark positions are in quarter-note beats; operation `beat` fields count from 0.",
  meters: METERS,
  durations: DURATIONS.map((d) => ({ name: d.label.toLowerCase(), beats: d.value })),
  pitch:
    "{ step: C–B, alter: -1 flat | 0 | 1 sharp, octave: 0–8 }, A0–C8, as it sounds (concert pitch); C4 is middle C.",
  instruments: INSTRUMENT_IDS.map((id) => {
    const { name, clef, range, transposition } = INSTRUMENTS[id];
    const written = transposition
      ? `written ${transposition.semitones} semitones above its sound`
      : "written as it sounds";
    return { id, name, clef, range: `MIDI ${range.low}–${range.high}`, written };
  }),
  articulations: ARTICULATIONS,
  slurs:
    "A slur joins a phrase of notes into one legato line (one breath, or one syllable over several notes). Use putSlur.",
  ties: "tiedToNext: the note is held into the next note (same pitch), across a barline too; they sound as one. Use setTie, or tie in replaceMeasure.",
  tuplets:
    "Triplets (3:2): three written values in the time of two, 3[C4e D4e E4e] in score text. A triplet fills half a beat (sixteenths), a beat (eighths, or a quarter and an eighth) or two beats (quarters), starts on a beat, in simple meters only. makeTuplet splits a value, removeTuplet undoes it; inside a triplet setDuration changes values within it. Other ratios (quintuplets, duplets) are not available.",
  dynamics: DYNAMICS,
  chordQualities: CHORD_QUALITY_NAMES.map((q) => q || "(major triad)"),
  chordExamples: ["C", "Am7", "F#m7b5", "Bbmaj7/D", "G7#9", "Dsus4", "Eø", "C6/9"],
  marks: MARK_KINDS.map((kind) => ({ kind, label: MARK_LABELS[kind] })),
  barStyles: ["notes", "slashes", "repeat"],
  stackedNotes:
    "Several notes on one stem, played together (a written-out chord): setNotes, or <C4 E4 G4>q in score text. Up to 6 notes; ties hold the notes the next chord repeats.",
  voices:
    'A staff may hold a second, independent line (voice 2, stems down): add it with addVoiceBars, write it with replaceMeasure voiceId "v2" or a "bar N v2:" line, remove it with removeVoiceBars.',
  drums: DRUM_PIECE_CODES.map((code) => ({
    code,
    piece: DRUM_PIECES[code].name,
    voice: DRUM_PIECES[code].voice === 1 ? "hands (v1)" : "feet (v2)",
  })),
  grooves: GROOVE_NAMES.map((name) => `${name} (${Object.keys(GROOVES[name]).join(", ")})`),
  parts:
    'Several instruments, each a part with its own staff (piano: two with setStaffCount): addPart, renamePart, movePart, removePart, setPartMix (volume, mute). Its score text lines are "bar 3 trumpet: …", its notes "trumpet/3#2".',
};

/** "Bar 2" or "Bars 1–4" for each run of consecutive bar numbers. */
function barRanges(numbers: number[]): string[] {
  const runs: [number, number][] = [];
  for (const n of numbers) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([from, to]) => (from === to ? `Bar ${from}` : `Bars ${from}–${to}`));
}

/**
 * With several parts, which parts' music changed in a bar ("trumpet"), or "" when only what
 * belongs to the whole bar did (chords, a section).
 */
function changedParts(before: Score, after: Score, measureId: string): string[] {
  if (after.parts.length < 2) return [""];
  const handles = partHandles(after);
  const music = (score: Score, partId: string) => {
    const measure = score.measures.find((m) => m.id === measureId);
    const part = score.parts.find((p) => p.id === partId);
    const ids = new Set(part?.staves.flatMap((staff) => staff.voices.map((v) => v.id)));
    return JSON.stringify(measure ? voiceBars(measure).filter((bar) => ids.has(bar.voiceId)) : null);
  };
  const parts = after.parts.filter((part) => music(before, part.id) !== music(after, part.id));
  return parts.length ? parts.map((part) => handles.get(part.id)!) : [""];
}

/** Whether a bar's voices other than the score's main line changed (other staves, voice 2). */
function otherLinesDiffer(before: Score, after: Score, measureId: string): boolean {
  const others = (score: Score) => JSON.stringify(voiceBars(score.measures.find((m) => m.id === measureId)!).slice(1));
  return others(before) !== others(after);
}

/** Short lines describing what changed between two revisions, for tool receipts and the panel. */
export function summarizeChange(before: Score, after: Score): string[] {
  const previous = describeScore(before).bars;
  const current = describeScore(after).bars;
  const added: number[] = [];
  const changed = new Map<string, number[]>();
  for (const bar of current) {
    const old = previous.find((b) => b.id === bar.id);
    if (!old) added.push(bar.bar);
    else if (
      JSON.stringify(old) !== JSON.stringify({ ...bar, bar: old.bar }) ||
      otherLinesDiffer(before, after, bar.id)
    )
      for (const part of changedParts(before, after, bar.id))
        changed.set(part, [...(changed.get(part) ?? []), bar.bar]);
  }
  const removed = previous.filter((bar) => !current.some((b) => b.id === bar.id)).length;
  const lines = [
    ...[...changed].flatMap(([part, bars]) =>
      barRanges(bars).map((range) => `${range}${part ? ` (${part})` : ""}: changed`),
    ),
    ...barRanges(added).map((range) => `${range}: added`),
    ...(removed ? [`${removed} bar${removed > 1 ? "s" : ""} removed`] : []),
  ];
  if (before.title !== after.title) lines.push(`Title: ${after.title}`);
  if (before.tempo !== after.tempo) lines.push(`Tempo: ${after.tempo}`);
  if (JSON.stringify(before.key) !== JSON.stringify(after.key)) lines.push(`Key: ${keyName(scoreKey(after))}`);
  if (JSON.stringify(before.parts) !== JSON.stringify(after.parts)) {
    lines.push(`Parts: ${[...partHandles(after).values()].join(", ")}`);
  }
  if (JSON.stringify(before.repeats) !== JSON.stringify(after.repeats)) lines.push("Repeats changed");
  if (JSON.stringify(before.annotations) !== JSON.stringify(after.annotations)) lines.push("Indications changed");
  if (JSON.stringify(before.slurs) !== JSON.stringify(after.slurs)) lines.push("Slurs changed");
  return lines.length ? lines : ["No visible change"];
}
