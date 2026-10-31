// Public API of the playback module (framework-free). The React transport hook lives in "./ui".
export { createPlaybackPlan, type ChordSound, type PlaybackEvent, type PlaybackPlan } from "./domain/plan";
export { soundsBetween, type PlannedSound } from "./domain/schedule-window";
export { ACCENT_VELOCITY, CHORD_VELOCITY, DYNAMIC_VELOCITY, LOUD_SAMPLE_VELOCITY } from "./domain/dynamics";
export { scoreSounds } from "./application/score-sounds";
