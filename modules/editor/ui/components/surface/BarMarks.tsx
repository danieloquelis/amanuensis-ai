import { placeBarMarks, type BarScene, type System } from "@/modules/engraving";
import {
  EndMarkText,
  MeasureRepeatSign,
  SectionMark,
  SlashBar,
  StartMarkGlyph,
  TempoMark,
} from "@/modules/engraving/ui";
import { MARK_LABELS } from "@/modules/score";
import styles from "./score-surface.module.css";
import { selectableItem, type SheetInteractions } from "./sheet-interactions";

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
  const { sectionX, startMarks, tempoX, endMarks } = placeBarMarks(bar);
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
          mark={mark.kind}
          x={mark.x}
          y={markY}
          {...selectable("mark", mark.id, MARK_LABELS[mark.kind])}
        />
      ))}
      {bar.tempo && <TempoMark tempo={bar.tempo} meter={bar.meter} x={tempoX} y={markY} />}
      {endMarks.map((mark) => (
        <EndMarkText
          key={mark.id}
          mark={mark.kind}
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
