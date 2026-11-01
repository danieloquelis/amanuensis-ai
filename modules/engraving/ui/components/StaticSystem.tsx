import type { System } from "../../domain/scene";
import { staffOf, staffTop } from "../../domain/staff-layout";
import { BeamLines } from "./BeamLines";
import { EventGlyph } from "./EventGlyph";
import { IndicationText } from "./IndicationText";
import { ChordSymbol } from "./LeadSheetGlyphs";
import { SlurCurve } from "./SlurCurve";
import { StaticBar } from "./StaticBar";
import { SystemStaves } from "./SystemStaves";
import { TieArcs } from "./TieArcs";

/**
 * One line of music, read-only, for previews and anywhere else nothing is edited. Same paint
 * order as the editable sheet: staves, bars, notes, beams, ties and slurs, indications, chords.
 */
export function StaticSystem({ system }: { system: System }) {
  return (
    <g>
      <SystemStaves system={system} />
      {system.bars.map((bar, index) => (
        <StaticBar key={bar.id} bar={bar} system={system} isFirstInSystem={index === 0} />
      ))}
      {system.events.map((item) => (
        <EventGlyph
          key={item.event.id}
          item={item}
          systemTop={staffTop(system, staffOf(item))}
          beamed={system.beamedIds.includes(item.event.id)}
        />
      ))}
      <BeamLines beams={system.beams} />
      <TieArcs ties={system.ties} />
      {system.slurs.map((slur) => (
        <SlurCurve key={slur.id} slur={slur} />
      ))}
      {system.labels.map((label) => (
        <IndicationText key={label.id} label={label} />
      ))}
      {system.chords.map((chord) => (
        <ChordSymbol key={chord.id} text={chord.text} x={chord.x} y={system.chordY} />
      ))}
    </g>
  );
}
