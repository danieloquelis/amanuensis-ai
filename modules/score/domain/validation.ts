import { DYNAMICS } from "./notation";
import { validateBarMarks, validateChords } from "./lead-sheet-validation";
import { anchorIds } from "./queries";
import {
  add,
  beats,
  fraction,
  isSupportedDuration,
  measureCapacity,
  meterName,
  METERS,
  soundingDuration,
} from "./rhythm";
import { scoreSchema, type Measure, type Meter, type Score, type ScoreEvent } from "./schema";
import { migrateScore } from "./migrations";
import { validateSlurs } from "./slurs";
import { validateAnnotationStaff, validateStructure } from "./structure-validation";
import { validateTies } from "./ties";
import { isNote, isRest, voiceBars } from "./voice-access";

/** Parses and validates a native score, migrating older files without changing IDs, notes or revision. */
export function parseScore(value: unknown): Score {
  const result = scoreSchema.safeParse(migrateScore(value));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid or unsupported score data: ${issue.path.join(".")} — ${issue.message}`);
  }
  const score = result.data;
  const ids = createUniqueIdRegistry();
  ids.add(score.id);
  validateStructure(score, ids);
  for (const measure of score.measures) validateMeasure(measure, ids);
  validateAnnotations(score, ids);
  validateAnnotationStaff(score);
  validateRepeats(score, ids);
  validateChords(score, ids);
  validateBarMarks(score, ids);
  validateTies(score);
  validateSlurs(score, ids);
  return score;
}

function createUniqueIdRegistry() {
  const ids = new Set<string>();
  return {
    add(id: string) {
      if (ids.has(id)) throw new Error("Score IDs must be unique.");
      ids.add(id);
    },
  };
}

export type IdRegistry = ReturnType<typeof createUniqueIdRegistry>;

/** Normalizes event durations in place and checks that every voice fills the bar exactly. */
function validateMeasure(measure: Measure, ids: IdRegistry) {
  ids.add(measure.id);
  if (!(METERS as readonly string[]).includes(meterName(measure.meter))) {
    throw new Error("Unsupported meter. Choose a listed time signature.");
  }
  for (const voiceBar of voiceBars(measure)) validateVoiceBar(voiceBar.events, measure.meter, ids);
}

/** One voice's events in a bar: supported values, adding up to exactly the bar. */
function validateVoiceBar(events: ScoreEvent[], meter: Meter, ids: IdRegistry) {
  let total = fraction(0);
  for (const event of events) {
    ids.add(event.id);
    event.duration = fraction(event.duration.numerator, event.duration.denominator);
    if (event.measureRest && (isNote(event) || events.length !== 1)) {
      throw new Error("A full-measure rest must occupy the measure alone.");
    }
    if (!event.measureRest && !isSupportedDuration(beats(event.duration))) {
      throw new Error("Unsupported duration; tuplets are not available yet.");
    }
    if (isRest(event) && event.articulation && event.articulation !== "fermata") {
      throw new Error("Only a fermata can be placed on a rest.");
    }
    total = add(total, soundingDuration(event));
  }
  const capacity = measureCapacity(meter);
  if (beats(total) !== capacity) {
    throw new Error(
      `Each ${meterName(meter)} measure must contain exactly ${capacity} quarter-note beats (four beats in 4/4).`,
    );
  }
}

function validateAnnotations(score: Score, ids: IdRegistry) {
  const anchors = anchorIds(score.measures);
  const dynamicAnchors = new Set<string>();
  for (const annotation of score.annotations) {
    ids.add(annotation.id);
    if (!anchors.has(annotation.targetId)) {
      throw new Error("An indication needs an existing note or measure anchor.");
    }
    if (annotation.kind !== "dynamic") continue;
    if (!(DYNAMICS as readonly string[]).includes(annotation.text)) {
      throw new Error("Choose a dynamic from pp through ff.");
    }
    if (dynamicAnchors.has(annotation.targetId)) {
      throw new Error("Only one dynamic may start at each anchor.");
    }
    dynamicAnchors.add(annotation.targetId);
  }
}

function validateRepeats(score: Score, ids: IdRegistry) {
  const repeatedMeasures = new Set<number>();
  for (const repeat of score.repeats) {
    ids.add(repeat.id);
    const start = score.measures.findIndex((m) => m.id === repeat.startMeasureId);
    const end = score.measures.findIndex((m) => m.id === repeat.endMeasureId);
    if (start < 0 || end < start) {
      throw new Error("Repeat boundaries must reference an ordered measure range.");
    }
    for (let index = start; index <= end; index++) {
      if (repeatedMeasures.has(index)) {
        throw new Error("Overlapping or nested repeats are not supported yet.");
      }
      repeatedMeasures.add(index);
    }
  }
}
