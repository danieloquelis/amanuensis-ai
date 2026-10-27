// Public API of the voice module (framework-free).
export { frequencyToMidi, segmentNotes, type SungNote } from "./domain/notes";
export { trackPitch, VOICE_RANGE_HZ, type PitchFrame, type Signal } from "./domain/pitch-tracker";
export {
  estimateTempo,
  quantizeNotes,
  rankTempi,
  toBars,
  type BarEvent,
  type PlacedNote,
  type TempoCandidate,
} from "./domain/rhythm";
export {
  createTake,
  describeTake,
  findSungSpans,
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
