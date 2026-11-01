import { beatX, STAFF_GAP, stavesLeft, systemBottom, type System } from "@/modules/engraving";
import { BeamLines, ChordSymbol, IndicationText, SystemStaves, TieArcs, TupletMarks } from "@/modules/engraving/ui";
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
  /** Staves being written right now by one of the band's musicians: they glow. */
  glowing?: ReadonlySet<string>;
  interactions: SheetInteractions;
  /** Notes arriving from the assistant, each with its delay before it pops in (ms). */
  arriving?: ReadonlyMap<string, number>;
};

/** One line of music. Children are drawn in paint order: staves, bars, notes, beams, triplets, ties and slurs, overlays. */
export function SheetSystem(props: SheetSystemProps) {
  const { system, eventOrder, partNames, laneNames, playBeat, glowing, interactions, arriving } = props;
  const events = [...system.events].sort((a, b) => eventOrder.get(a.event.id)! - eventOrder.get(b.event.id)!);

  return (
    <g>
      {glowing?.size ? <StaffGlow system={system} glowing={glowing} /> : null}
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
          arrival={arriving?.get(item.event.id)}
        />
      ))}
      <BeamLines beams={system.beams} />
      <TupletMarks tuplets={system.tuplets} />
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
  // `data-playhead`: the workspace scrolls to keep it in view.
  return (
    <line
      data-playhead=""
      className={styles.playhead}
      x1={x}
      x2={x}
      y1={system.top - 20}
      y2={systemBottom(system) + 30}
    />
  );
}

/** Room the glow leaves around a staff (px), and its corner radius. */
const GLOW_MARGIN = { x: 10, y: 12 };
const GLOW_RADIUS = 10;

/** A soft light behind the staves a band musician is writing, so the eye follows who is playing. */
function StaffGlow({ system, glowing }: { system: System; glowing: ReadonlySet<string> }) {
  const left = stavesLeft(system) - GLOW_MARGIN.x;
  const last = system.bars[system.bars.length - 1];
  const width = last.x + last.width + GLOW_MARGIN.x - left;
  return (system.staves ?? [])
    .filter((staff) => glowing.has(staff.staffId))
    .map((staff) => (
      <rect
        key={`glow-${staff.staffId}`}
        className={styles.staffGlow}
        x={left}
        y={staff.top - GLOW_MARGIN.y}
        width={width}
        height={STAFF_GAP * 4 + GLOW_MARGIN.y * 2}
        rx={GLOW_RADIUS}
      />
    ));
}
