import {
  barEvents,
  eventOnsets,
  findEvent,
  findVoiceId,
  midiPitch,
  SCORE_LIMITS,
  voiceNumber,
  type Operation,
  type Score,
} from "@/modules/score";
import type { HeardOption } from "./sung-figures";

/** Operations that change notes or rhythm. Chords, marks and text on heard bars stay allowed. */
const NOTE_EDITS = new Set<Operation["type"]>([
  "replaceMeasure",
  "clearMeasure",
  "deleteMeasure",
  "moveEvent",
  "removeEvent",
  "setDuration",
  "setPitch",
  "setTie",
  "transpose",
  "setMeter",
  "removeVoiceBars",
]);

/**
 * A heard line: a bar and the voice in it (1 is the main line), as "measureId:voice". Sung bass
 * under a sung melody is another line, so writing it never touches what was heard.
 */
const lineKey = (measureId: string, voice: number) => `${measureId}:${voice}`;
const everyLine = (measureId: string) =>
  Array.from({ length: SCORE_LIMITS.voicesPerStaff }, (_, i) => lineKey(measureId, i + 1));
const measureOfLine = (key: string) => key.slice(0, key.lastIndexOf(":"));

/** The number of a voice named in an operation: an ID, or a handle like "v2"; the main line when absent. */
function voiceNumberOf(score: Score, voiceId: unknown): number {
  if (typeof voiceId !== "string") return 1;
  const handle = /^v(\d)$/.exec(voiceId);
  return handle ? Number(handle[1]) : voiceNumber(score, voiceId);
}

/** Every basic operation inside `operation` (a batch is opened up). */
const flatten = (operation: Operation): Operation[] =>
  operation.type === "batch" ? (operation.operations as Operation[]).flatMap(flatten) : [operation];

/** The lines an operation writes notes into, as a transcription does. */
export function writtenLines(score: Score, operation: Operation): string[] {
  return flatten(operation).flatMap((op) =>
    op.type === "replaceMeasure" ? [lineKey(op.measureId, voiceNumberOf(score, op.voiceId))] : [],
  );
}

/** The lines whose notes an operation changes, resolving notes to their bar and voice. */
function editedLines(score: Score, operation: Operation): string[] {
  return flatten(operation)
    .filter((op) => NOTE_EDITS.has(op.type))
    .flatMap((op) => {
      const voice = "voiceId" in op && op.voiceId ? voiceNumberOf(score, op.voiceId) : null;
      const lines = (measureId: string) => (voice ? [lineKey(measureId, voice)] : everyLine(measureId));
      if ("measureIds" in op && op.measureIds) return (op.measureIds as string[]).flatMap(lines);
      if ("measureId" in op) return lines(op.measureId as string);
      if (op.type === "removeVoiceBars") return score.measures.flatMap((m) => lines(m.id));
      const eventIds = "eventIds" in op ? (op.eventIds as string[]) : "eventId" in op ? [op.eventId as string] : [];
      return eventIds.flatMap((id) => {
        const found = findEvent(score, id);
        return found ? [lineKey(found.measure.id, voiceNumber(score, found.voiceId))] : [];
      });
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

const BEAT_TOLERANCE = 1e-6;

/** Whether a note change is one the singing itself supports: a heard option for that note. */
function supported(score: Score, op: Operation, options: HeardOption[]): boolean {
  if (op.type !== "setPitch" || !op.pitch) return false;
  const found = findEvent(score, op.eventId);
  if (!found) return false;
  const bar = score.measures.indexOf(found.measure) + 1;
  const events = barEvents(found.measure, found.voiceId);
  const beat = eventOnsets(events)[events.findIndex((event) => event.id === op.eventId)];
  const voice = voiceNumber(score, found.voiceId);
  const midi = midiPitch(op.pitch);
  return options.some(
    (option) =>
      option.bar === bar &&
      Math.abs(option.beat - beat) < BEAT_TOLERANCE &&
      voiceNumber(score, findVoiceId(score, option.line) ?? "") === voice &&
      midiPitch(option.pitch) === midi,
  );
}

/**
 * What the musician sang is kept as heard, unless the singing itself says otherwise: within the
 * turn that transcribed it, the agent may change those lines' notes (`heard` holds
 * "measureId:voice" keys from `writtenLines`) when the musician asked for it, quoting their words
 * (`asked`, checked against what they said or typed, `said`), or when every changed note takes
 * one of the `options` the take supports (a runner-up the ear nearly heard, or the note that
 * completes a figure sung elsewhere). This stops the agent rewriting a transcription from its own
 * idea of the tune, while letting it judge like a musician. Returns the reason an edit is
 * refused, or null when it may go ahead.
 */
export function refuseHeardBarEdit(
  score: Score,
  operation: Operation,
  heard: Set<string>,
  asked: string | undefined,
  said: string,
  options: HeardOption[] = [],
): string | null {
  const touched = [
    ...new Set(
      editedLines(score, operation)
        .filter((key) => heard.has(key))
        .map(measureOfLine),
    ),
  ];
  if (!touched.length || quotesMusician(asked, said)) return null;
  const changes = flatten(operation).filter((op) => NOTE_EDITS.has(op.type));
  if (changes.every((op) => supported(score, op, options))) return null;
  const bars = touched.map((id) => score.measures.findIndex((m) => m.id === id) + 1).sort((a, b) => a - b);
  const which = `Bar${bars.length > 1 ? "s" : ""} ${bars.join(", ")}`;
  if (asked)
    return `${which}: "${asked}" is not what the musician said. Quote their words exactly, or keep the notes as heard.`;
  return `${which} hold what the musician just sang. Change a note there only to one of the transcription's options (a doubtful note's other pitch, or the note that completes a figure it lists), one setPitch per note; or, if they asked for another change, call again with asked set to their words, quoted exactly. Otherwise keep the notes as heard and mention any doubt in your reply.`;
}
