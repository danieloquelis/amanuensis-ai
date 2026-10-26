import type { BarScene, System } from "@/modules/engraving";
import {
  EndMarkText,
  MeasureRepeatSign,
  SectionMark,
  SlashBar,
  StartMarkGlyph,
  TempoMark,
} from "@/modules/engraving/ui";
import { isStartMark, MARK_LABELS } from "@/modules/score";
import styles from "./score-surface.module.css";
import { selectableItem, type SheetInteractions } from "./sheet-interactions";

const GAP = 6;
const START_MARK_WIDTH = 22;
const END_MARK_INSET = 4;
const sectionWidth = (label: string) => 12 + label.length * 9;
/** Rough italic text width, enough to keep several end marks from overlapping. */
const endMarkWidth = (kind: keyof typeof MARK_LABELS) => MARK_LABELS[kind].length * 7 + (kind === "toCoda" ? 22 : 0);

/** Lays marks out along the bar: section and start marks from the left, end marks from the right. */
function placeMarks(bar: BarScene) {
  let left = bar.x + 2;
  const sectionX = left;
  if (bar.section) left += sectionWidth(bar.section) + GAP;
  const startMarks = [];
  for (const mark of bar.marks.filter((m) => isStartMark(m.kind))) {
    startMarks.push({ ...mark, x: left });
    left += START_MARK_WIDTH + GAP;
  }
  let right = bar.endX - END_MARK_INSET;
  const endMarks = [];
  for (const mark of bar.marks.filter((m) => !isStartMark(m.kind))) {
    endMarks.push({ ...mark, x: right });
    right -= endMarkWidth(mark.kind) + GAP * 2;
  }
  return { sectionX, startMarks, tempoX: Math.max(left, bar.notesX), endMarks };
}

/**
 * Lead-sheet furniture of one bar: section box, segno/coda signs and tempo from the left, end
 * marks (Fine, To Coda, D.C., D.S.) from the right, and slashes or a repeat sign on the staff.
 * Every mark is selectable and deletable; a section box is renamed by double-click.
 */
export function BarMarks({
  bar,
  system,
  interactions,
}: {
  bar: BarScene;
  system: System;
  interactions: SheetInteractions;
}) {
  const { markY, top } = system;
  const { sectionX, startMarks, tempoX, endMarks } = placeMarks(bar);
  const selectable = (kind: "mark" | "section", id: string, label: string) =>
    selectableItem(interactions, { kind, id }, label, { selected: styles.itemSelected, base: styles.annotation });

  return (
    <g>
      {bar.section && (
        <SectionMark
          label={bar.section}
          x={sectionX}
          y={markY}
          {...selectable("section", bar.id, `Section ${bar.section}`)}
          onDoubleClick={(e) => interactions.openMenu("section", bar.id, e.clientX, e.clientY)}
        />
      )}
      {startMarks.map((mark) => (
        <StartMarkGlyph
          key={mark.id}
          mark={mark.kind as "segno" | "coda"}
          x={mark.x}
          y={markY}
          {...selectable("mark", mark.id, MARK_LABELS[mark.kind])}
        />
      ))}
      {bar.tempo && <TempoMark tempo={bar.tempo} x={tempoX} y={markY} />}
      {endMarks.map((mark) => (
        <EndMarkText
          key={mark.id}
          mark={mark.kind as Exclude<typeof mark.kind, "segno" | "coda">}
          x={mark.x}
          y={markY}
          {...selectable("mark", mark.id, MARK_LABELS[mark.kind])}
        />
      ))}
      {bar.style === "slashes" && <SlashBar bar={bar} top={top} />}
      {bar.style === "repeat" && <MeasureRepeatSign bar={bar} top={top} />}
    </g>
  );
}
