import { barlineStaves, barStaves, closesWithFinalBarline, placeBarMarks } from "../../domain/bar-furniture";
import type { BarScene, System } from "../../domain/scene";
import { stavesLeft } from "../../domain/staff-layout";
import { EndMarkText, MeasureRepeatSign, SectionMark, SlashBar, StartMarkGlyph } from "./LeadSheetGlyphs";
import { BarNumber, Barline, FinalBarline, RepeatEnd, RepeatStart, TempoMark, TimeSignature } from "./StaffGlyphs";

type StaticBarProps = { bar: BarScene; system: System; isFirstInSystem: boolean };

/**
 * One bar's furniture, read-only: the same glyphs in the same places as the editable sheet
 * (number at a line start, meters, barlines per part, lead-sheet marks, repeats).
 */
export function StaticBar({ bar, system, isFirstInSystem }: StaticBarProps) {
  const staves = barStaves(system);
  const { sectionX, startMarks, tempoX, endMarks } = placeBarMarks(bar);
  const { markY, top } = system;
  return (
    <g>
      {isFirstInSystem && <BarNumber bar={bar} x={stavesLeft(system)} y={markY} />}
      {bar.meterX !== null &&
        staves.map((staff) => <TimeSignature key={staff.top} meter={bar.meter} x={bar.meterX!} top={staff.top} />)}
      {barlineStaves(system).map((part) =>
        closesWithFinalBarline(bar) ? (
          <FinalBarline key={part.top} x={bar.endX} top={part.top} bottom={part.barlineEnd} />
        ) : (
          <Barline key={part.top} x={bar.endX} top={part.top} bottom={part.barlineEnd} />
        ),
      )}
      {bar.section && <SectionMark label={bar.section} x={sectionX} y={markY} />}
      {startMarks.map((mark) => (
        <StartMarkGlyph key={mark.id} mark={mark.kind} x={mark.x} y={markY} />
      ))}
      {bar.tempo && <TempoMark tempo={bar.tempo} meter={bar.meter} x={tempoX} y={markY} />}
      {endMarks.map((mark) => (
        <EndMarkText key={mark.id} mark={mark.kind} x={mark.x} y={markY} />
      ))}
      {bar.style === "slashes" && <SlashBar bar={bar} top={top} />}
      {bar.style === "repeat" && <MeasureRepeatSign bar={bar} top={top} />}
      {bar.repeatStartX !== null &&
        staves.map((staff) => (
          <RepeatStart key={staff.top} x={bar.repeatStartX!} barNumber={bar.number} top={staff.top} />
        ))}
      {bar.repeatEnd &&
        staves.map((staff, index) => <RepeatEnd key={staff.top} bar={bar} top={staff.top} count={index === 0} />)}
    </g>
  );
}
