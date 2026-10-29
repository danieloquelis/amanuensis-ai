import { respellScore } from "../respell";
import type { Score } from "../schema";
import { pruneSlurs } from "../slurs";
import { pruneTies } from "../ties";
import { parseScore } from "../validation";
import type { Draft, OperationContext } from "./draft";
import { moveEvent, removeEvent, setArticulation, setDuration, setNotes, setPitch, setTie } from "./event-operations";
import {
  appendMeasure,
  clearMeasure,
  deleteMeasure,
  duplicateMeasure,
  replaceMeasure,
  setMeasureWidth,
} from "./measure-operations";
import { moveAnnotation, putChord, putMark, setMeasureStyle, setSection } from "./lead-sheet-operations";
import { setMeter } from "./meter-operations";
import { newScore } from "./new-score";
import { setClef, setInstrument } from "./part-operations";
import { addVoiceBars, removeVoiceBars } from "./voice-operations";
import { copyBars } from "./copy-bars";
import { copyNotes } from "./copy-notes";
import { putSlur, shapeSlur, transpose } from "./phrase-operations";
import { putAnnotation, putRepeat, removeNotation, removeTempo, rename, setKey, setTempo } from "./notation-operations";
import { commandSchema, type Command, type OperationOf, type OperationType } from "./schema";

type OperationHandlers = {
  [T in OperationType]: (draft: Draft, op: OperationOf<T>, context: OperationContext) => void;
};

const handlers: OperationHandlers = {
  setPitch,
  setNotes,
  removeEvent,
  setDuration,
  moveEvent,
  setArticulation,
  setTie,
  transpose,
  putSlur,
  shapeSlur,
  appendMeasure,
  deleteMeasure,
  duplicateMeasure,
  clearMeasure,
  replaceMeasure,
  setMeasureWidth,
  setMeter,
  setTempo,
  removeTempo,
  setKey,
  rename,
  newScore,
  putAnnotation,
  putRepeat,
  removeNotation,
  moveAnnotation,
  putChord,
  setMeasureStyle,
  setSection,
  putMark,
  setInstrument,
  setClef,
  addVoiceBars,
  removeVoiceBars,
  copyBars,
  copyNotes,
};

/**
 * The single mutation path for human and AI edits. Applies a command atomically against its
 * expected revision and returns a new, validated score; the input score is never modified.
 */
export function applyCommand(score: Score, input: Command): Score {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid operation: ${parsed.error.issues[0].message}`);
  const command = parsed.data;
  if (command.expectedRevision !== score.revision) {
    throw new Error("The score changed. Read the latest revision before applying this edit.");
  }
  const draft = structuredClone(score);
  const operations = command.operation.type === "batch" ? command.operation.operations : [command.operation];
  operations.forEach((op, index) => {
    const handler = handlers[op.type] as (draft: Draft, op: unknown, context: OperationContext) => void;
    handler(draft, op, { idPrefix: `${command.requestId}-${index}` });
  });
  pruneTies(draft);
  respellScore(draft, `${command.requestId}-spell`);
  pruneSlurs(draft);
  draft.revision++;
  return parseScore(draft);
}
