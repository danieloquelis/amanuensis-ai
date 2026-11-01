/**
 * Retries for model calls. A model call changes nothing, so one that failed before its answer
 * began can be sent again: the provider was busy (429), had a fault (5xx), or the connection
 * dropped. Once its text has been passed on (a draft the musician already sees), a retry would
 * write it twice, so that failure stands.
 */

/** Statuses another try may fix: a timeout, rate limiting, or a fault on the provider's side. */
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
/** Tries per call, the first included. */
const MAX_ATTEMPTS = 3;
/** The first wait; each later one doubles, with jitter so retries don't arrive together. */
export const FIRST_RETRY_MS = 1_000;
/** A provider asking for a longer wait than this fails the turn rather than leave it hanging. */
const LONGEST_WAIT_MS = 20_000;
const MS_PER_SECOND = 1_000;

const ENDED_EARLY = "The model's answer ended early. Please try again.";

/** A failure another try may fix. `waitMs` is how long the provider asked us to wait, if it said. */
export class TransientError extends Error {
  constructor(
    message: string,
    readonly waitMs?: number,
  ) {
    super(message);
  }
}

export const isRetryStatus = (status: number) => RETRY_STATUSES.has(status);

/** A `Retry-After` header (seconds, or an HTTP date) in milliseconds, if it has one. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * MS_PER_SECOND);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** A stream that stopped before its end: worth another try only if none of its text was passed on. */
export const endedEarly = (textSent: boolean): Error =>
  textSent ? new Error(ENDED_EARLY) : new TransientError(ENDED_EARLY);

/**
 * Runs `attempt` until it succeeds, fails for good, or runs out of tries. Only `TransientError`s
 * are retried, never once `signal` has stopped the call.
 */
export async function withRetries<T>(
  attempt: () => Promise<T>,
  { signal, firstDelayMs = FIRST_RETRY_MS }: { signal?: AbortSignal; firstDelayMs?: number } = {},
): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof TransientError) || tries >= MAX_ATTEMPTS || signal?.aborted) throw error;
      const backoff = firstDelayMs * 2 ** (tries - 1) * (0.5 + Math.random() / 2);
      const wait = error.waitMs ?? backoff;
      if (wait > LONGEST_WAIT_MS) throw error;
      await pause(wait, signal);
    }
  }
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
