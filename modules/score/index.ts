// Public API of the score module. Other modules import from "@/modules/score" only.
export { createSession, execute, travel, type Session } from "./application/session";
export { createExample } from "./domain/example";
export { ARTICULATIONS, DYNAMICS, REPEAT_PASSES, type Articulation, type Dynamic } from "./domain/notation";
export { applyCommand } from "./domain/operations/apply-command";
export {
  commandSchema,
  type BasicOperation,
  type Command,
  type DurationValue,
  type Operation,
} from "./domain/operations/schema";
export {
  isWithinOctaveRange,
  midiPitch,
  movePitch,
  OCTAVE_RANGE,
  pitchName,
  staffPosition,
  STEPS,
  type Step,
} from "./domain/pitch";
export { anchorIds, findEvent, locateEvent, measureStarts } from "./domain/queries";
export {
  add,
  beatGroupLength,
  beats,
  durationFromBeats,
  durationNotation,
  DURATIONS,
  fraction,
  measureCapacity,
  meterName,
  METERS,
  type Fraction,
} from "./domain/rhythm";
export {
  MEASURE_WIDTH,
  SCORE_LIMITS,
  TEMPO_RANGE,
  type Annotation,
  type Measure,
  type Meter,
  type Pitch,
  type Repeat,
  type Score,
  type ScoreEvent,
} from "./domain/schema";
export { parseScore } from "./domain/validation";
