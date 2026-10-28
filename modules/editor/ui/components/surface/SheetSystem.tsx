import { beatX, type System } from "@/modules/engraving";
import { BeamLines, ChordSymbol, IndicationText, KeySignature, StaffLines, TrebleClef } from "@/modules/engraving/ui";
import styles from "./score-surface.module.css";
import { BarArea } from "./BarArea";
import { SelectedNoteToolbar } from "./SelectedNoteToolbar";
import { SheetBar } from "./SheetBar";
import { SheetEvent } from "./SheetEvent";
import { selectableItem, type SheetInteractions } from "./sheet-interactions";

type SheetSystemProps = {
  system: System;
  eventOrder: Map<string, number>;
  selectedId: string | null;
  playBeat: number | null;
  showQuickActions: boolean;
  interactions: SheetInteractions;
};

/** One line of music. Children are drawn in paint order: staff, bars, notes, beams, overlays. */
export function SheetSystem({
  system,
  eventOrder,
  selectedId,
  playBeat,
  showQuickActions,
  interactions,
}: SheetSystemProps) {
  const events = [...system.events].sort((a, b) => eventOrder.get(a.event.id)! - eventOrder.get(b.event.id)!);
  const selectedItem =
    showQuickActions && !interactions.multiple ? system.events.find((item) => item.event.id === selectedId) : undefined;

  return (
    <g>
      <StaffLines top={system.top} endX={system.endX} />
      <TrebleClef top={system.top} />
      <KeySignature marks={system.keySignature} />
      {system.bars.map((bar) => (
        <BarArea key={`area-${bar.id}`} bar={bar} system={system} interactions={interactions} />
      ))}
      {system.bars.map((bar, index) => (
        <SheetBar
          key={bar.id}
          bar={bar}
          system={system}
          isFirstInSystem={index === 0}
          isLastInSystem={index === system.bars.length - 1}
          interactions={interactions}
        />
      ))}
      {events.map((item) => (
        <SheetEvent
          key={item.event.id}
          item={item}
          system={system}
          selected={interactions.isPicked({ kind: "event", id: item.event.id })}
          playBeat={playBeat}
          interactions={interactions}
        />
      ))}
      <BeamLines beams={system.beams} />
      {system.labels.map((label) => (
        <IndicationText
          key={label.id}
          label={label}
          {...selectableItem(
            interactions,
            { kind: "annotation", id: label.annotationId },
            `Edit indication ${label.text}`,
            {
              selected: styles.itemSelected,
              base: `${styles.annotation} ${styles.draggable}`,
            },
          )}
          onDoubleClick={(e) => interactions.openMenu("annotation", label.annotationId, e.clientX, e.clientY)}
          onContextMenu={(e) => {
            e.preventDefault();
            interactions.openMenu("annotation", label.annotationId, e.clientX, e.clientY);
          }}
          onPointerDown={(e) => interactions.gestures.startLabelDrag(e, label.annotationId)}
          onPointerMove={(e) => interactions.gestures.moveLabelDrag(e, label.annotationId)}
          onPointerUp={interactions.gestures.finishGesture}
          onPointerCancel={interactions.gestures.cancelGesture}
        />
      ))}
      {system.chords.map((chord) => (
        <ChordSymbol
          key={chord.id}
          text={chord.text}
          x={chord.x}
          y={system.chordY}
          {...selectableItem(interactions, { kind: "chord", id: chord.id }, `Chord ${chord.text}`, {
            selected: styles.itemSelected,
            base: styles.chord,
          })}
          onDoubleClick={(e) => interactions.openMenu("chord", chord.id, e.clientX, e.clientY)}
          onContextMenu={(e) => {
            e.preventDefault();
            interactions.openMenu("chord", chord.id, e.clientX, e.clientY);
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
  const x = beatX(bar, playBeat);
  return <line className={styles.playhead} x1={x} x2={x} y1={system.top - 20} y2={system.top + 78} />;
}
