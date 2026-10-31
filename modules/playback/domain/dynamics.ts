/** MIDI velocity (1–127) for each written dynamic. */
export const DYNAMIC_VELOCITY: Record<string, number> = { pp: 33, p: 49, mp: 64, mf: 80, f: 96, ff: 112 };
export const DEFAULT_VELOCITY = DYNAMIC_VELOCITY.mf;
/** First velocity of the loud sample layer, shared by piano and drums, so mf and above sound bright on every instrument. */
export const LOUD_SAMPLE_VELOCITY = 77;
/** An accent strikes harder than the dynamic around it. */
export const ACCENT_VELOCITY = 16;
/** Chord symbols comp softly under the melody. */
export const CHORD_VELOCITY = 30;
const MAX_VELOCITY = 127;

/** The velocity of a note at a dynamic, raised by an accent and capped at the MIDI maximum. */
export const accented = (velocity: number, accent: boolean) =>
  Math.min(MAX_VELOCITY, velocity + (accent ? ACCENT_VELOCITY : 0));
