import { useEffect, useState } from "react";
import type { BandMember } from "../../application/musicians";
import { loadBand, saveBand, STARTER_BAND, type BandSetup } from "../../infrastructure/local-band";

/**
 * Band Mode for this browser: whether arrangements go to the band, and the band itself. Turning
 * it on the first time starts from a usual line-up, ready to be named.
 */
export function useBand() {
  const [setup, setSetup] = useState<BandSetup>({ on: false, members: [] });
  // Read after mount, so the server and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSetup(loadBand()));
    return () => cancelAnimationFrame(frame);
  }, []);
  const keep = (next: BandSetup) => {
    setSetup(next);
    saveBand(next);
  };
  return {
    ...setup,
    turn: (on: boolean) => keep({ on, members: on && !setup.members.length ? STARTER_BAND : setup.members }),
    setMembers: (members: BandMember[]) => keep({ ...setup, members }),
  };
}
