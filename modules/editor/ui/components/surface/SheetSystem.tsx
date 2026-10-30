import { beatX, systemBottom, type System } from "@/modules/engraving";
import { BeamLines, ChordSymbol, IndicationText, SystemStaves, TieArcs } from "@/modules/engraving/ui";
import styles from "./score-surface.module.css";
import { BarArea } from "./BarArea";
import { SheetBar } from "./SheetBar";
import { SheetEvent } from "./SheetEvent";
import { SheetSlur } from "./SheetSlur";
import { selectableItem, type SheetInteractions } from "./sheet-interactions";

type SheetSystemProps = {
  system: System;
  eventOrder: Map<string, number>;
  /** Each event's part name, with several parts. */
  partNames: Map<string, string>;
  /** Each staff's lane name, with several staves. */
  laneNames: Map<string, string>;
  playBeat: number | null;
  interactions: SheetInteractions;
};

/** One line of music. Children are drawn in paint order: staves, bars, notes, beams, ties and slurs, overlays. */
export function SheetSystem({ system, eventOrder, partNames, laneNames, playBeat, interactions }: SheetSystemProps) {
  const events = [...system.events].sort((a, b) => eventOrder.get(a.event.id)! - eventOrder.get(b.event.id)!);

  return (
    <g>
      <SystemStaves system={system} />
      {system.bars.map((bar) =>
        system.staves ? (
          system.staves.map((staff) => (
            <BarArea
              key={`area-${bar.id}-${staff.staffId}`}
              bar={bar}
              top={staff.top}
              staffId={staff.staffId}
              laneName={laneNames.get(staff.staffId)}
              interactions={interactions}
            />
          ))
        ) : (
          <BarArea key={`area-${bar.id}`} bar={bar} top={system.top} interactions={interactions} />
        ),
      )}
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
          partName={partNames.get(item.event.id)}
          selected={interactions.isPicked({ kind: "event", id: item.event.id })}
          playBeat={playBeat}
          interactions={interactions}
        />
      ))}
      <BeamLines beams={system.beams} />
      <TieArcs ties={system.ties} />
      {system.slurs.map((slur) => (
        <SheetSlur key={slur.id} slur={slur} interactions={interactions} />
      ))}
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
          // Right-click selects, like a click; double-click edits.
          onContextMenu={(e) => {
            e.preventDefault();
            interactions.selectItem({ kind: "annotation", id: label.annotationId });
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
            interactions.selectItem({ kind: "chord", id: chord.id });
          }}
        />
      ))}
      {playBeat !== null && <Playhead system={system} playBeat={playBeat} />}
    </g>
  );
}

function Playhead({ system, playBeat }: { system: System; playBeat: number }) {
  const bar = system.bars.find((b) => playBeat >= b.beat && playBeat < b.beat + b.capacity);
  if (!bar) return null;
  const x = beatX(bar, playBeat);
  return <line className={styles.playhead} x1={x} x2={x} y1={system.top - 20} y2={systemBottom(system) + 30} />;
}
