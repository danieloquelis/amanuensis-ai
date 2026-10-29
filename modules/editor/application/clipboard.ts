import {
  barEvents,
  eventText,
  everyEvent,
  findEvent,
  voiceNumber,
  scoreText,
  voiceLine,
  writeBars,
  type Operation,
  type Score,
} from "@/modules/score";
import type { Edit } from "./note-edits";
import type { SheetRef } from "./sheet-selection";

/**
 * Copy and paste on the sheet. What is copied is remembered by ID (so a paste in the same score
 * copies everything: voices, chords, dynamics, slurs) and as score text (for the system clipboard,
 * and for pasting bars into another score).
 */
export type Clip = {
  kind: "bars" | "notes";
  scoreId: string;
  ids: string[];
  /** Score text: bar lines numbered from 1 ("bar 1: C4q …"), or the notes themselves ("C4q <E4 G4>h"). */
  text: string;
};

const BAR_LINE = /^bar (\d+)((?: \([^)]*\))?(?: v\d)?):/;

/** The copied bars' lines of score text, renumbered from bar 1. */
function barsText(score: Score, measureIds: string[]): string {
  const numbers = measureIds.map((id) => score.measures.findIndex((m) => m.id === id) + 1);
  return scoreText(score)
    .split("\n")
    .flatMap((line) => {
      const match = BAR_LINE.exec(line);
      const at = match ? numbers.indexOf(Number(match[1])) : -1;
      return at === -1 ? [] : [line.replace(BAR_LINE, `bar ${at + 1}$2:`)];
    })
    .join("\n");
}

/** What the selection copies: picked bars (in score order), or the run of notes from the first picked to the last in one voice. */
export function copyFromSelection(score: Score, picked: SheetRef[]): Clip | null {
  const bars = picked.filter((ref) => ref.kind === "bar").map((ref) => ref.id);
  if (bars.length) {
    const ids = score.measures.map((m) => m.id).filter((id) => bars.includes(id));
    return { kind: "bars", scoreId: score.id, ids, text: barsText(score, ids) };
  }
  const events = picked.filter((ref) => ref.kind === "event").map((ref) => ref.id);
  if (!events.length) return null;
  const line = voiceLine(score, events[0]);
  const indexes = events.map((id) => line.findIndex((e) => e.id === id));
  if (indexes.some((i) => i === -1)) return null;
  const run = line.slice(Math.min(...indexes), Math.max(...indexes) + 1);
  const ids = run.map((e) => e.id);
  return { kind: "notes", scoreId: score.id, ids, text: run.map(eventText).join(" ") };
}

/** A paste, and how to find what it wrote once it is committed (to select it and paste on after it). */
export type PasteEdit = Edit & { pasted: (score: Score) => SheetRef[] };

const barIndex = (score: Score, id: string) => score.measures.findIndex((m) => m.id === id);

/**
 * The paste of a clip at the selection. In the same score the copied bars or notes are written with
 * every detail; bars from another score (or from text) are written from their score text.
 *
 * Pasting onto what was just copied, or onto what the last paste wrote (`followUp`), continues
 * right after it, adding a bar at the end when needed: copy a note, ⌘V, ⌘V gives three. Elsewhere
 * the paste overwrites from the selected bar or note on. Throws a readable message when there is
 * nowhere to paste or nothing usable.
 */
export function pasteEdit(
  score: Score,
  clip: Clip,
  picked: SheetRef[],
  requestId: string,
  followUp: string[] = [],
): PasteEdit {
  const ref = picked.find((r) => r.kind === "bar" || r.kind === "event");
  const found = ref?.kind === "event" ? findEvent(score, ref.id) : null;
  const measureId = ref?.kind === "bar" ? ref.id : found?.measure.id;
  if (!ref || !measureId || barIndex(score, measureId) === -1) throw new Error("Select a bar or a note to paste at.");
  const present =
    clip.scoreId === score.id &&
    clip.ids.every((id) => (clip.kind === "bars" ? barIndex(score, id) !== -1 : findEvent(score, id)));
  if (!present) {
    if (clip.kind === "notes") throw new Error("Those notes are no longer in the score; copy them again.");
    return { ...pasteBarsText(score, clip.text, measureId, requestId), pasted: () => [] };
  }
  const own = clip.kind === "bars" ? measureId : ref.id;
  const run = clip.ids.includes(own) ? clip.ids : followUp.includes(own) ? followUp : null;
  if (clip.kind === "bars") return pasteBars(score, clip, run ? { after: run.at(-1)! } : { at: measureId }, requestId);
  const at = found?.event.id ?? barEvents(score.measures[barIndex(score, measureId)])[0].id;
  return pasteNotes(score, clip, run ? { after: run.at(-1)! } : { at }, requestId);
}

/** Copied bars from a bar on, or right after one (a bar is added when it was the last). */
function pasteBars(score: Score, clip: Clip, where: { at: string } | { after: string }, requestId: string): PasteEdit {
  const operations: Operation[] = [];
  const after = "after" in where ? where.after : null;
  let toMeasureId = after ? score.measures[barIndex(score, after) + 1]?.id : (where as { at: string }).at;
  if (!toMeasureId) {
    operations.push({ type: "appendMeasure", afterMeasureId: after! });
    toMeasureId = `${requestId}-0-bar`;
  }
  operations.push({ type: "copyBars", measureIds: clip.ids, toMeasureId });
  const pasted = (after: Score) => {
    const start = barIndex(after, toMeasureId);
    return after.measures.slice(start, start + clip.ids.length).map((m): SheetRef => ({ kind: "bar", id: m.id }));
  };
  const count = clip.ids.length;
  return { operation: single(operations), receipt: `Pasted ${count} bar${count === 1 ? "" : "s"}`, pasted };
}

/** Copied notes from a note on, or right after one in its voice (a bar is added when it was the last). */
function pasteNotes(score: Score, clip: Clip, where: { at: string } | { after: string }, requestId: string): PasteEdit {
  const operations: Operation[] = [];
  const after = "after" in where ? where.after : null;
  let toEventId = after ? null : (where as { at: string }).at;
  if (after) {
    const line = voiceLine(score, after);
    toEventId = line[line.findIndex((e) => e.id === after) + 1]?.id ?? null;
  }
  if (!toEventId) {
    // Past the end of the score: a new bar (with the voice in it) to paste into.
    const voice = voiceNumber(score, findEvent(score, after!)!.voiceId);
    operations.push({ type: "appendMeasure" });
    if (voice > 1) operations.push({ type: "addVoiceBars", voice, measureIds: [`${requestId}-0-bar`] });
    toEventId = voice > 1 ? `${requestId}-1-0-r0` : `${requestId}-0-r0`;
  }
  const prefix = `${requestId}-${operations.length}-n`;
  operations.push({ type: "copyNotes", eventIds: clip.ids, toEventId });
  const pasted = (after: Score) =>
    everyEvent(after)
      .filter((e) => e.id.startsWith(prefix))
      .map((e): SheetRef => ({ kind: "event", id: e.id }));
  return { operation: single(operations), receipt: "Pasted notes", pasted };
}

const single = (operations: Operation[]): Operation =>
  operations.length === 1 ? operations[0] : ({ type: "batch", operations } as Operation);

/** Bars given as score text ("bar 1: …"), written from the target bar on. */
export function pasteBarsText(score: Score, text: string, measureId: string, requestId: string): Edit {
  const start = score.measures.findIndex((m) => m.id === measureId);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => BAR_LINE.test(line))
    .map((line) => line.replace(BAR_LINE, (_, n: string, rest: string) => `bar ${start + Number(n)}${rest}:`));
  if (!lines.length) throw new Error('Nothing to paste: copy bars or notes, or score text like "bar 1: C4q E4q G4h".');
  const { command } = writeBars(score, lines.join("\n"), requestId);
  return { operation: command.operation, receipt: `Pasted ${lines.length} bar line${lines.length === 1 ? "" : "s"}` };
}

/** Cutting: the copied bars are cleared, or the copied notes become rests. */
export function cutEdit(clip: Clip): Edit {
  const operations: Operation[] =
    clip.kind === "bars"
      ? clip.ids.map((measureId) => ({ type: "clearMeasure", measureId }))
      : clip.ids.map((eventId) => ({ type: "removeEvent", eventId }));
  return {
    operation: { type: "batch", operations } as Operation,
    receipt: clip.kind === "bars" ? "Cut bars" : "Cut notes",
  };
}
