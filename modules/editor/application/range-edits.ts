import {
  everyEvent,
  findEvent,
  isNote,
  slurEnds,
  voiceLine,
  type Articulation,
  type BasicOperation,
  type Score,
} from "@/modules/score";
import type { Edit } from "./note-edits";
import type { SheetRef } from "./sheet-selection";

/** An octave in staff steps. */
const OCTAVE = 7;
/** Articulations that suit a whole phrase; a fermata belongs on one note. */
export const PHRASE_ARTICULATIONS = ["staccato", "accent", "tenuto"] as const satisfies Articulation[];

/** The picked notes and rests in score order, when two or more are picked and nothing else. */
export function pickedEvents(score: Score, refs: SheetRef[]): string[] | null {
  if (refs.length < 2 || refs.some((r) => r.kind !== "event")) return null;
  const order = everyEvent(score).map((e) => e.id);
  const ids = refs.map((r) => r.id).filter((id) => order.includes(id));
  return ids.length < 2 ? null : ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

const notesOf = (score: Score, ids: string[]) =>
  ids.filter((id) => {
    const found = findEvent(score, id);
    return found !== null && isNote(found.event);
  });

/** Where a slur over these events would start and end, or null when fewer than two are notes. */
function slurSpan(score: Score, ids: string[]) {
  try {
    return slurEnds(score, ids[0], ids.at(-1)!);
  } catch {
    return null;
  }
}

/** The slur that already covers exactly these events (rests at the ends aside), if any. */
export function slurOver(score: Score, ids: string[]) {
  const span = slurSpan(score, ids);
  return span && score.slurs.find((s) => s.startEventId === span.startEventId && s.endEventId === span.endEventId);
}

/** Slurs the phrase, or removes the slur it already has. Null when it holds fewer than two notes. */
export function slurEdit(score: Score, ids: string[]): Edit | null {
  const existing = slurOver(score, ids);
  if (existing) return { operation: { type: "removeNotation", id: existing.id }, receipt: "Removed slur" };
  const span = slurSpan(score, ids);
  return span && { operation: { type: "putSlur", ...span }, receipt: "Slurred" };
}

/** S on the sheet: slurs a picked phrase, or one note to the next note after it. */
export function slurKeyEdit(score: Score, refs: SheetRef[], eventId: string): Edit | null {
  const picked = pickedEvents(score, refs);
  if (picked) return slurEdit(score, picked);
  const order = voiceLine(score, eventId);
  const index = order.findIndex((e) => e.id === eventId);
  const next = order.slice(index + 1).find(isNote);
  return index === -1 || !next ? null : slurEdit(score, [eventId, next.id]);
}

/** Whether every note in the phrase has this articulation. */
export function allHave(score: Score, ids: string[], articulation: Articulation): boolean {
  const notes = notesOf(score, ids);
  return notes.length > 0 && notes.every((id) => findEvent(score, id)?.event.articulation === articulation);
}

/** Gives every note the articulation, or takes it off all of them when they all have it. */
export function phraseArticulationEdit(score: Score, ids: string[], articulation: Articulation): Edit | null {
  const notes = notesOf(score, ids);
  if (!notes.length) return null;
  const value = allHave(score, ids, articulation) ? null : articulation;
  const operations = notes.map((eventId): BasicOperation => ({
    type: "setArticulation",
    eventId,
    articulation: value,
  }));
  return {
    operation: { type: "batch", operations },
    receipt: value ? `Added ${articulation}` : `Removed ${articulation}`,
  };
}

/** Moves the phrase an octave up (1) or down (-1), keeping every accidental. */
export function octaveEdit(ids: string[], direction: 1 | -1): Edit {
  return {
    operation: { type: "transpose", eventIds: ids, steps: direction * OCTAVE },
    receipt: direction > 0 ? "Up an octave" : "Down an octave",
  };
}
