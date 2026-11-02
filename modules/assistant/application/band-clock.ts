/**
 * The band's time: Band Mode answers within a few minutes, so the band plays to a budget. The
 * first pass always plays; a rehearsal only while there is room for one; and at the deadline the
 * musicians still writing stop, keeping what they wrote.
 */
export const BAND_SECONDS = 120;
/** A rehearsal round needs about this long: none starts with less left. */
const REHEARSAL_SECONDS = 60;
/** Past the budget, a musician mid-reply gets this long before it is stopped. */
const GRACE_SECONDS = 30;
const MS = 1000;

export function createBandClock(turn?: AbortSignal, now: () => number = Date.now) {
  let started: number | null = null;
  let deadline: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const elapsed = () => (started === null ? 0 : (now() - started) / MS);
  return {
    /** Starts the clock (once) and returns the signal the musicians play under. */
    start(): AbortSignal {
      if (!deadline) {
        started = now();
        deadline = new AbortController();
        const stop = deadline;
        timer = setTimeout(() => stop.abort(new Error("The band's time is up.")), (BAND_SECONDS + GRACE_SECONDS) * MS);
        // The clock never keeps the server waiting once the turn is over.
        (timer as { unref?: () => void }).unref?.();
      }
      return turn ? AbortSignal.any([turn, deadline.signal]) : deadline.signal;
    },
    /** Whether a rehearsal round still fits in the band's time. */
    roomForRehearsal: () => elapsed() <= BAND_SECONDS - REHEARSAL_SECONDS,
    stop() {
      if (timer) clearTimeout(timer);
    },
  };
}
