import { useEffect, useState } from "react";
import { loadBandMode, saveBandMode } from "../../infrastructure/local-band";

/** Band Mode for this browser: when on, music several parts play goes to a band the agent puts together. */
export function useBand() {
  const [on, setOn] = useState(false);
  // Read after mount, so the server and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOn(loadBandMode()));
    return () => cancelAnimationFrame(frame);
  }, []);
  return {
    on,
    turn: (next: boolean) => {
      setOn(next);
      saveBandMode(next);
    },
  };
}
