import { z } from "zod";
import { DYNAMICS } from "./notation";
import { anchorIds } from "./queries";
import { add, beats, fraction, isSupportedDuration, measureCapacity, meterName, METERS } from "./rhythm";
import { eventSchema, idSchema, scoreSchema, type Measure, type Score } from "./schema";

const legacyScoreSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: idSchema,
  revision: z.number().int().nonnegative(),
  title: z.string(),
  tempo: z.number(),
  measures: z.array(
    z.strictObject({
      id: idSchema,
      events: z.array(eventSchema.omit({ articulation: true, measureRest: true, gap: true })),
    }),
  ),
});

/** Parses and validates a native score, migrating v1 files without changing IDs, notes or revision. */
export function parseScore(value: unknown): Score {
  const result = scoreSchema.safeParse(migrateVersion1(value));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid or unsupported score data: ${issue.path.join(".")} — ${issue.message}`);
  }
  const score = result.data;
  const ids = createUniqueIdRegistry();
  ids.add(score.id);
  for (const measure of score.measures) validateMeasure(measure, ids);
  validateAnnotations(score, ids);
  validateRepeats(score, ids);
  return score;
}

function migrateVersion1(value: unknown): unknown {
  const isVersion1 = value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 1;
  if (!isVersion1) return value;
  const legacy = legacyScoreSchema.parse(value);
  return {
    ...legacy,
    schemaVersion: 2,
    measures: legacy.measures.map((m) => ({ ...m, meter: { numerator: 4, denominator: 4 } })),
    annotations: [],
    repeats: [],
  };
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

type IdRegistry = ReturnType<typeof createUniqueIdRegistry>;

/** Normalizes event durations in place and checks that the bar is exactly full. */
function validateMeasure(measure: Measure, ids: IdRegistry) {
  ids.add(measure.id);
  if (!(METERS as readonly string[]).includes(meterName(measure.meter))) {
    throw new Error("Unsupported meter. Choose a listed time signature.");
  }
  let total = fraction(0);
  for (const event of measure.events) {
    ids.add(event.id);
    event.duration = fraction(event.duration.numerator, event.duration.denominator);
    if (event.measureRest && (event.pitch || measure.events.length !== 1)) {
      throw new Error("A full-measure rest must occupy the measure alone.");
    }
    if (event.gap && (event.pitch || event.measureRest || event.articulation)) {
      throw new Error("An unfinished space cannot contain a note, rest, or articulation.");
    }
    if (!event.measureRest && !isSupportedDuration(beats(event.duration))) {
      throw new Error("Unsupported duration; tuplets are not available yet.");
    }
    if (!event.pitch && event.articulation && event.articulation !== "fermata") {
      throw new Error("Only a fermata can be placed on a rest.");
    }
    total = add(total, event.duration);
  }
  const capacity = measureCapacity(measure.meter);
  if (beats(total) !== capacity) {
    throw new Error(
      `Each ${meterName(measure.meter)} measure must contain exactly ${capacity} quarter-note beats (four beats in 4/4).`,
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
