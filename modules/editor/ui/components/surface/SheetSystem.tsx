import type { System } from "@/modules/engraving";
import { BeamLines, IndicationText, StaffLines, TrebleClef } from "@/modules/engraving/ui";
import type { Score } from "@/modules/score";
import styles from "./score-surface.module.css";
import { SelectedNoteToolbar } from "./SelectedNoteToolbar";
import { SheetBar } from "./SheetBar";
import { SheetEvent } from "./SheetEvent";
import type { SheetInteractions } from "./sheet-interactions";

type SheetSystemProps = {
  system: System;
  score: Score;
  eventOrder: Map<string, number>;
  selectedId: string | null;
  playBeat: number | null;
  showQuickActions: boolean;
  interactions: SheetInteractions;
};

/** One line of music. Children are drawn in paint order: staff, bars, notes, beams, overlays. */
export function SheetSystem({
  system,
  score,
  eventOrder,
  selectedId,
  playBeat,
  showQuickActions,
  interactions,
}: SheetSystemProps) {
  const events = [...system.events].sort((a, b) => eventOrder.get(a.event.id)! - eventOrder.get(b.event.id)!);
  const selectedItem = showQuickActions ? system.events.find((item) => item.event.id === selectedId) : undefined;

  return (
    <g>
      <StaffLines top={system.top} />
      <TrebleClef top={system.top} />
      {system.bars.map((bar, index) => (
        <SheetBar
          key={bar.id}
          bar={bar}
          system={system}
          isFirstInSystem={index === 0}
          score={score}
          interactions={interactions}
        />
      ))}
      {events.map((item) => (
        <SheetEvent
          key={item.event.id}
          item={item}
          system={system}
          selected={selectedId === item.event.id}
          playBeat={playBeat}
          interactions={interactions}
        />
      ))}
      <BeamLines beams={system.beams} />
      {system.labels.map((label) => (
        <IndicationText
          key={label.id}
          label={label}
          className={styles.annotation}
          role="button"
          tabIndex={0}
          aria-label={`Edit indication ${label.text}`}
          onDoubleClick={(e) => interactions.openMenu("annotation", label.annotationId, e.clientX, e.clientY)}
          onContextMenu={(e) => {
            e.preventDefault();
            interactions.openMenu("annotation", label.annotationId, e.clientX, e.clientY);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const rect = e.currentTarget.getBoundingClientRect();
            interactions.openMenu("annotation", label.annotationId, rect.right, rect.bottom);
          }}
        />
      ))}
      {selectedItem && <SelectedNoteToolbar item={selectedItem} system={system} interactions={interactions} />}
      {playBeat !== null && <Playhead system={system} playBeat={playBeat} />}
    </g>
  );
}

function Playhead({ system, playBeat }: { system: System; playBeat: number }) {
  const bar = system.bars.find((b) => playBeat >= b.beat && playBeat < b.beat + b.capacity);
  if (!bar) return null;
  const x = bar.notesX + (playBeat - bar.beat) * bar.unit;
  return <line className={styles.playhead} x1={x} x2={x} y1={system.top - 20} y2={system.top + 78} />;
}
