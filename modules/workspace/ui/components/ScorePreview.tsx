import { useMemo } from "react";
import { layoutScore, systemBottom } from "@/modules/engraving";
import { StaticSystem } from "@/modules/engraving/ui";
import type { Score } from "@/modules/score";
import { previewScore } from "../../application/preview-score";
import styles from "./home.module.css";

/** Ink above the staff (chord and mark rows) and below it (dynamics, beams) kept in the crop. */
const HEADROOM = 66;
const FOOTROOM = 30;
/** Breathing room past the final barline. */
const RIGHT_MARGIN = 12;

/**
 * The opening system of a song, engraved by the real engine and drawn read-only with the same
 * renderer rules as the sheet. Shows at most `PREVIEW_PARTS` instruments.
 */
export function ScorePreview({ score }: { score: Score }) {
  const system = useMemo(() => layoutScore(previewScore(score)).systems[0], [score]);
  if (!system) return null;
  const top = system.top - HEADROOM;
  const bottom = systemBottom(system) + FOOTROOM;
  // Crop to this system's own width: the last line is ragged, so the full scene width would shrink it.
  const right = system.endX + RIGHT_MARGIN;
  return (
    <svg className={styles.preview} viewBox={`0 ${top} ${right} ${bottom - top}`} aria-hidden="true" focusable="false">
      <StaticSystem system={system} />
    </svg>
  );
}
