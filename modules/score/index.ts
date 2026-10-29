// Public API of the score module. Other modules import from "@/modules/score" only.
export { describeScore, SCORE_VOCABULARY, summarizeChange } from "./application/describe-score";
export { createSession, execute, executeAll, travel, type Session } from "./application/session";
export { positionOf } from "./application/notation-positions";
export { resolvePositions } from "./application/positions";
export { durationCode, pitchText, SCORE_TEXT_GUIDE, scoreText } from "./application/score-text";
export { parseBarsText, writeBars } from "./application/score-text-write";
export {
  CHORD_QUALITIES,
  CHORD_QUALITY_NAMES,
  formatChord,
  parseChordSymbol,
  pitchClass,
  type ChordQuality,
  type ChordRoot,
} from "./domain/chords";
export { createExample } from "./domain/example";
export { rankKeysForChords, type ChordSymbol, type KeyCandidate } from "./domain/harmony";
export { suggestChords, type ChordCandidate, type ChordSlot, type Harmonization } from "./domain/harmonize";
export {
  findTempoMarking,
  TEMPO_MARKINGS,
  tempoMarkingFor,
  typicalTempo,
  type TempoMarking,
} from "./domain/tempo-markings";
export { C_MAJOR, inKey, KEY_FIFTHS, keyAlter, keyName, keySignatureSteps, scoreKey, spellMidi } from "./domain/key";
export {
  END_MARKS,
  isStartMark,
  JUMP_MARKS,
  MARK_KINDS,
  MARK_LABELS,
  nextSectionLabel,
  SECTION_LABEL_MAX,
  START_MARKS,
  type EndMark,
  type MarkKind,
  type StartMark,
} from "./domain/navigation";
export { ARTICULATIONS, DYNAMICS, REPEAT_PASSES, type Articulation, type Dynamic } from "./domain/notation";
export { applyCommand } from "./domain/operations/apply-command";
export { commandSchemaWithout } from "./domain/operations/command-subset";
export {
  commandSchema,
  type BasicOperation,
  type Command,
  type DurationValue,
  type Operation,
  type OperationType,
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
  LABEL_OFFSET_LIMIT,
  MEASURE_WIDTH,
  keySignatureSchema,
  meterSchema,
  SCORE_LIMITS,
  SLUR_LIFT,
  TEMPO_RANGE,
  type Annotation,
  type Chord,
  type LabelOffset,
  type Mark,
  type KeySignature,
  type Measure,
  type Meter,
  type Pitch,
  type Repeat,
  type Score,
  type ScoreEvent,
  type Slur,
} from "./domain/schema";
export { legatoIds, slurEnds } from "./domain/slurs";
export { nextEvent, samePitch, tieChain, tiePairs } from "./domain/ties";
export { parseScore } from "./domain/validation";
