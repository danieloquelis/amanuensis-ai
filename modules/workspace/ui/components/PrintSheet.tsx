import { useMemo } from "react";
import { layoutScore, systemBottom, systemCeiling } from "@/modules/engraving";
import { StaticSystem } from "@/modules/engraving/ui";
import type { Score } from "@/modules/score";
import styles from "./workspace.module.css";

/** Room kept above a system's highest ink (bar numbers, chords, marks, text) and below its lowest (stems, dynamics). */
const HEADROOM = 8;
const FOOTROOM = 40;
/** How far a dynamic's letters reach below its baseline, with a little room. */
const LABEL_DEPTH = 14;

/**
 * The sheet as printed: each system its own picture, cropped to its ink at the page's full
 * width, so the printed page breaks between systems and never through one.
 */
export function PrintSheet({ score }: { score: Score }) {
  const scene = useMemo(() => layoutScore(score), [score]);
  return (
    <div className={styles.printSheet}>
      {scene.systems.map((system) => {
        const top = systemCeiling(system) - HEADROOM;
        const lowest = Math.max(
          systemBottom(system) + FOOTROOM,
          ...system.labels.map((label) => label.y + LABEL_DEPTH),
        );
        const height = lowest - top;
        return (
          <div key={system.firstMeasure} className={styles.printSystem}>
            <svg viewBox={`0 ${top} ${scene.width} ${height}`} aria-hidden="true" focusable="false">
              <StaticSystem system={system} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
