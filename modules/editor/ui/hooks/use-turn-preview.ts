import { useEffect, useMemo, useState } from "react";
import type { Command, Score } from "@/modules/score";
import { arrivals, turnPreview, withDraft, type TurnDraft } from "../../application/turn-preview";

/** Arriving notes are spread left to right this far apart, up to a whole spread, so a large write reads as written. */
const ARRIVAL_STEP_MS = 20;
const ARRIVAL_SPREAD_MS = 1200;
/** After the longest delay and the pop itself, arrivals are forgotten (a remounted line won't pop again). */
const ARRIVAL_MS = ARRIVAL_SPREAD_MS + 400;
const NONE: ReadonlyMap<string, number> = new Map();

/**
 * What the sheet shows while the assistant works: the committed score with the turn's edits so far
 * (`live`, null when no turn runs) and the bars it is writing right now (`draft`), the notes that just
 * arrived with how long each waits before it pops in, and whether a turn is working. Edits that no
 * longer apply show the committed score.
 */
export function useTurnPreview(score: Score, live: readonly Command[] | null, draft: TurnDraft | null = null) {
  const preview = useMemo(() => (live?.length ? turnPreview(score, live) : null), [score, live]);
  const shown = useMemo(() => {
    const base = preview ?? score;
    return live && draft ? withDraft(base, draft) : base;
  }, [preview, score, live, draft]);
  // What arrived is worked out while rendering, from the score shown last.
  const [seen, setSeen] = useState({ shown, arriving: NONE });
  if (seen.shown !== shown) {
    const order = live ? arrivals(seen.shown, shown) : NONE;
    const delays = new Map([...order].map(([id, k]) => [id, Math.min(k * ARRIVAL_STEP_MS, ARRIVAL_SPREAD_MS)]));
    setSeen({ shown, arriving: delays });
  }
  useEffect(() => {
    if (!seen.arriving.size) return;
    const timer = setTimeout(() => setSeen((current) => ({ ...current, arriving: NONE })), ARRIVAL_MS);
    return () => clearTimeout(timer);
  }, [seen.arriving]);
  return { score: shown, arriving: seen.arriving, working: live !== null };
}
