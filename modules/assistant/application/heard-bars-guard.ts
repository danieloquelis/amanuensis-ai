import { findEvent, type Operation, type Score } from "@/modules/score";

/** Operations that change notes or rhythm. Chords, marks and text on heard bars stay allowed. */
const NOTE_EDITS = new Set<Operation["type"]>([
  "replaceMeasure",
  "clearMeasure",
  "deleteMeasure",
  "moveEvent",
  "removeEvent",
  "setDuration",
  "setPitch",
  "setMeter",
]);

/** Every basic operation inside `operation` (a batch is opened up). */
const flatten = (operation: Operation): Operation[] =>
  operation.type === "batch" ? (operation.operations as Operation[]).flatMap(flatten) : [operation];

/** The bars an operation writes notes into (measure IDs), as a transcription does. */
export function writtenMeasures(operation: Operation): string[] {
  return flatten(operation).flatMap((op) => (op.type === "replaceMeasure" ? [op.measureId] : []));
}

/** The bars whose notes an operation changes (measure IDs), resolving notes to their bars. */
function editedMeasures(score: Score, operation: Operation): string[] {
  return flatten(operation)
    .filter((op) => NOTE_EDITS.has(op.type))
    .flatMap((op) => {
      if ("measureIds" in op) return op.measureIds as string[];
      if ("measureId" in op) return [op.measureId as string];
      if ("eventId" in op) {
        const found = findEvent(score, op.eventId as string);
        return found ? [found.measure.id] : [];
      }
      return [];
    });
}

/** A quote must be at least this many words, so it carries an actual request. */
const MIN_QUOTE_WORDS = 3;
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Whether `quote` is really something the musician said or typed (spacing and punctuation aside). */
export function quotesMusician(quote: string | undefined, said: string): boolean {
  if (!quote) return false;
  const wanted = words(quote);
  return wanted.split(" ").length >= MIN_QUOTE_WORDS && ` ${words(said)} `.includes(` ${wanted} `);
}

/**
 * What the musician sang is kept as heard: within the turn that transcribed it, the agent may
 * change those bars' notes only when the musician asked for it, and it must quote their words
 * (`asked`), which are checked against what they said or typed (`said`). This stops the agent
 * rewriting a transcription from its own idea of the tune. Returns the reason an edit is refused,
 * or null when it may go ahead.
 */
export function refuseHeardBarEdit(
  score: Score,
  operation: Operation,
  heard: Set<string>,
  asked: string | undefined,
  said: string,
): string | null {
  const touched = [...new Set(editedMeasures(score, operation).filter((id) => heard.has(id)))];
  if (!touched.length || quotesMusician(asked, said)) return null;
  const bars = touched.map((id) => score.measures.findIndex((m) => m.id === id) + 1).sort((a, b) => a - b);
  const which = `Bar${bars.length > 1 ? "s" : ""} ${bars.join(", ")}`;
  if (asked)
    return `${which}: "${asked}" is not what the musician said. Quote their words exactly, or keep the notes as heard.`;
  return `${which} hold what the musician just sang. Change them only if they asked: call score_edit again with asked set to their words, quoted exactly. Otherwise keep the notes as heard and mention any doubt in your reply.`;
}
