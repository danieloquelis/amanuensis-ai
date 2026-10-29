import type { SlurArc } from "@/modules/engraving";
import { SlurCurve } from "@/modules/engraving/ui";
import styles from "./score-surface.module.css";
import { selectableItem, type SheetInteractions } from "./sheet-interactions";

const slurLabel = ([from, to]: [number, number]) => (from === to ? `Slur, bar ${from}` : `Slur, bars ${from}–${to}`);

/**
 * A selectable slur (one line's arc of it). Click selects it and Delete removes it; dragging it
 * up or down, or ↑/↓ while selected, makes the arc rounder or flatter.
 */
export function SheetSlur({ slur, interactions }: { slur: SlurArc; interactions: SheetInteractions }) {
  const { slurGestures } = interactions;
  const above = slur.bulge < 0;
  const selectable = selectableItem(interactions, { kind: "slur", id: slur.slurId }, slurLabel(slur.bars), {
    selected: styles.itemSelected,
    base: `${styles.slur} ${styles.draggable}`,
  });
  return (
    <SlurCurve
      slur={slur}
      {...selectable}
      onKeyDown={(e) => {
        selectable.onKeyDown(e);
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        slurGestures.nudge(slur.slurId, above, e.key === "ArrowUp");
      }}
      onPointerDown={(e) => interactions.interactive && slurGestures.start(e, slur.slurId, above)}
      onPointerMove={slurGestures.move}
      onPointerUp={slurGestures.finish}
      onPointerCancel={slurGestures.cancel}
    />
  );
}
