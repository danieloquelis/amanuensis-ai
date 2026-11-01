import {
  barEvents,
  C_MAJOR,
  findVoiceId,
  isNote,
  pitchName,
  spellMidi,
  voiceNumber,
  type Score,
} from "@/modules/score";
import { missedAttacks, segmentNotes, spanFrames, type SungNote, type VoiceTake } from "@/modules/voice";
import type { SpanPlaces } from "./transcription-placement";

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

const seconds = (value: number) => `${value.toFixed(2)} s`;
const heardName = (note: SungNote) => pitchName(spellMidi(Math.round(note.midi), C_MAJOR));

/** The notes written in a line's bars, one per attack (a tied chain once), by name. */
function writtenNotes(score: Score, from: number, count: number, line: string): string[][] {
  const voiceId = findVoiceId(score, line) ?? undefined;
  let tiedOn = false;
  return score.measures.slice(from - 1, from - 1 + count).map((measure) =>
    barEvents(measure, voiceId).flatMap((event) => {
      const attack = isNote(event) && event.pitch && !tiedOn;
      tiedOn = isNote(event) && Boolean(event.tie);
      return attack ? [pitchName(event.pitch!)] : [];
    }),
  );
}

/** Where an unpitched attack falls among the heard notes, and what it most likely was. */
function describeMissed(time: number, notes: SungNote[]): string {
  const before = notes.filter((note) => note.start < time).at(-1);
  const after = notes.find((note) => note.start > time);
  const around = [
    before && `the ${heardName(before)} at ${seconds(before.start)}`,
    after && `the ${heardName(after)} at ${seconds(after.start)}`,
  ]
    .filter(Boolean)
    .join(" and ");
  const likely =
    before && after && heardName(before) === heardName(after) ? `: probably another ${heardName(before)}` : "";
  return `at ${seconds(time)}${around ? `, between ${around}` : ""}${likely} (struck, but no pitch could be read)`;
}

/**
 * Checks what a turn wrote from a take against the take itself: for each span written this turn,
 * the notes written bar by bar next to the notes heard (with their times), and every place
 * something was clearly struck or sung but no note was heard. Each such attack lets the agent add
 * one repeat of a neighbouring note to that line (`allowRepeats`); it may also rewrite the bars'
 * rhythm, keeping the notes in order.
 */
export function checkTake(
  take: VoiceTake | null,
  spanIds: string[] | undefined,
  score: Score,
  places: SpanPlaces,
  allowRepeats: (voice: number, count: number) => void,
): ToolResult {
  const written = [...places].filter(([key]) => !spanIds?.length || spanIds.some((id) => key.startsWith(`${id} `)));
  if (!written.length)
    return { ok: false, error: "No sung span was written this turn: write it first, then check it." };
  const spans = written.map(([key, { bar, bars }]) => {
    const [spanId, line] = key.split(" ");
    const frames = take && spanFrames(take, spanId);
    if (!frames) throw new Error(`There is no sung span ${spanId}.`);
    const notes = segmentNotes(frames);
    const missed = missedAttacks(frames, notes);
    allowRepeats(voiceNumber(score, findVoiceId(score, line) ?? ""), missed.length);
    const byBar = writtenNotes(score, bar, bars, line);
    const notesWritten = byBar.flat().length;
    return {
      spanId,
      line,
      written: byBar.map((names, i) => `bar ${bar + i}: ${names.join(" ") || "no notes"}`),
      heard: notes.map((note) => `${seconds(note.start)} ${heardName(note)}`).join(" · "),
      notesHeard: notes.length,
      notesWritten,
      ...(missed.length ? { missed: missed.map((time) => describeMissed(time, notes)) } : {}),
      ...(notesWritten !== notes.length ? { mismatch: `${notes.length} notes heard, ${notesWritten} written` } : {}),
    };
  });
  return {
    ok: true,
    spans,
    next: "Compare: a heard note missing from the bars, a missed attack that is likely a repeat, or a rhythm that does not match the times heard. Fix the bars (score_write, any rhythm, the notes heard in order, a repeat only where one was missed), or say why they are right.",
  };
}
