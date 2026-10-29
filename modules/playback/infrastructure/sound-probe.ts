import type { SoundRequest } from "../application/sound-port";

type ProbeHost = { __amanuensisSoundProbe?: (request: SoundRequest) => void };

/**
 * Reports every scheduled or auditioned note to `globalThis.__amanuensisSoundProbe`, when a test
 * installs one. Headless browsers cannot listen, so browser tests check what was asked to sound.
 * A no-op otherwise.
 */
export function probeSound(request: SoundRequest) {
  (globalThis as ProbeHost).__amanuensisSoundProbe?.(request);
}
