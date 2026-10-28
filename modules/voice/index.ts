// Public API of the voice module (framework-free).
export { frequencyToMidi, segmentNotes, type SungNote } from "./domain/notes";
export {
  trackPitch,
  withPitchTrack,
  VOICE_RANGE_HZ,
  type PitchFrame,
  type PitchTrack,
  type Signal,
} from "./domain/pitch-tracker";
export {
  estimateTempo,
  quantizeNotes,
  distinctTempi,
  rankTempi,
  tempoCosts,
  toBars,
  type BarEvent,
  type PlacedNote,
  type TempoCandidate,
} from "./domain/rhythm";
export {
  createTake,
  findSungSpans,
  spanFrames,
  spanSignal,
  type SpeechTurn,
  type SungSpan,
  type VoiceTake,
} from "./domain/take";
export { transcribeMelody, type MelodyOptions, type MelodyTranscription } from "./domain/transcribe-melody";
export { fitHarmony, fitToChords, snapToChordTones, type HarmonicFit } from "./domain/harmonic-fit";
export {
  estimateKey,
  rankKeysForMelody,
  resolvePitches,
  tuneToScale,
  type ChordContext,
  type ResolvedNote,
} from "./domain/musical-priors";
export type { SpeechRecognizer } from "./application/speech-port";
export type { PitchTracker } from "./application/pitch-port";
export { decodeWav, encodeWav } from "./domain/wav";
export { barEvidence, hearingOf, type BarEvidence, type Hearing } from "./domain/evidence";
export {
  readRhythm,
  DEFAULT_WEIGHTS,
  type RhythmOptions,
  type RhythmReading,
  type RhythmWeights,
} from "./domain/tempo-map";
export { reportTempo, type TempoAlternative, type TempoReport } from "./domain/tempo-report";
export { describeTake, takeParts, type TakePart } from "./domain/timeline";
export { transcribeSpans, type PlacedSpan, type SpansOptions } from "./domain/transcribe-spans";
