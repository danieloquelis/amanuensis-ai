import { useMemo } from "react";
import { layoutScore, systemBottom, type System } from "@/modules/engraving";
import {
  Barline,
  BarNumber,
  BeamLines,
  ChordSymbol,
  EndMarkText,
  EventGlyph,
  FinalBarline,
  IndicationText,
  MeasureRepeatSign,
  RepeatEnd,
  RepeatStart,
  SectionMark,
  SlashBar,
  SlurCurve,
  StartMarkGlyph,
  SystemStaves,
  TieArcs,
  TimeSignature,
} from "@/modules/engraving/ui";
import { isStartMark, type EndMark, type StartMark } from "@/modules/score";
import { localWorkspaceRepository } from "@/modules/projects";
import styles from "./home.module.css";

/** Ink above the staff (chord and mark rows) and below it (dynamics, beams) kept in the crop. */
const HEADROOM = 66;
const FOOTROOM = 30;
/** Breathing room past the final barline. */
const RIGHT_MARGIN = 12;

/**
 * The opening system of a workspace, engraved by the real engine and drawn with its glyphs.
 * Read-only: no selection, no gestures; a workspace that cannot load shows nothing here.
 */
export function ScorePreview({ workspaceId }: { workspaceId: string }) {
  const score = useMemo(() => {
    try {
      return localWorkspaceRepository.load(workspaceId);
    } catch {
      return null;
    }
  }, [workspaceId]);
  const scene = useMemo(() => (score ? layoutScore(score) : null), [score]);
  const system = scene?.systems[0];
  if (!system) return null;
  const top = system.top - HEADROOM;
  const bottom = systemBottom(system) + FOOTROOM;
  // Crop to this system's own width: the last line is ragged, so the full scene width would shrink it.
  const right = system.endX + RIGHT_MARGIN;
  return (
    <svg className={styles.preview} viewBox={`0 ${top} ${right} ${bottom - top}`} aria-hidden="true" focusable="false">
      <StaticSystem system={system} />
    </svg>
  );
}

/** Paint order mirrors the sheet: staves, barlines, chords, labels, marks, events, beams, ties, slurs. */
function StaticSystem({ system }: { system: System }) {
  const staves = system.staves ?? [
    { staffId: "", top: system.top, clef: system.clef, keySignature: system.keySignature },
  ];
  const topFor = (staff?: number) => staves[staff ?? 0]?.top ?? system.top;
  return (
    <g>
      <SystemStaves system={system} />
      {system.bars.map((bar, index) => (
        <g key={bar.id}>
          {index === 0 && <BarNumber bar={bar} y={system.markY} />}
          {staves.map((staff) => (
            <g key={staff.staffId}>
              {bar.repeatStartX !== null && <RepeatStart x={bar.repeatStartX} barNumber={bar.number} top={staff.top} />}
              {bar.meterX !== null && <TimeSignature meter={bar.meter} x={bar.meterX} top={staff.top} />}
              {bar.final ? (
                <FinalBarline x={bar.endX} top={staff.top} bottom={staff.barlineEnd} />
              ) : (
                <Barline x={bar.endX} top={staff.top} bottom={staff.barlineEnd} />
              )}
              {bar.repeatEnd !== null && <RepeatEnd bar={bar} top={staff.top} />}
              {bar.style === "slashes" && <SlashBar bar={bar} top={staff.top} />}
              {bar.style === "repeat" && <MeasureRepeatSign bar={bar} top={staff.top} />}
            </g>
          ))}
          {bar.section && <SectionMark label={bar.section} x={bar.x + 2} y={system.markY} />}
          {bar.marks
            .filter((mark): mark is typeof mark & { kind: StartMark } => isStartMark(mark.kind))
            .map((mark, k) => (
              <StartMarkGlyph key={mark.id} mark={mark.kind} x={bar.x + 2 + k * 28} y={system.markY} />
            ))}
          {bar.marks
            .filter((mark): mark is typeof mark & { kind: EndMark } => !isStartMark(mark.kind))
            .map((mark) => (
              <EndMarkText key={mark.id} mark={mark.kind} x={bar.endX - 4} y={system.markY} />
            ))}
        </g>
      ))}
      {system.chords.map((chord) => (
        <ChordSymbol key={chord.id} text={chord.text} x={chord.x} y={system.chordY} />
      ))}
      {system.labels.map((label) => (
        <IndicationText key={label.id} label={label} />
      ))}
      {system.events.map((item) => (
        <EventGlyph
          key={item.event.id}
          item={item}
          systemTop={topFor(item.staff)}
          beamed={system.beamedIds.includes(item.event.id)}
        />
      ))}
      <BeamLines beams={system.beams} />
      <TieArcs ties={system.ties} />
      {system.slurs.map((slur) => (
        <SlurCurve key={slur.id} slur={slur} />
      ))}
    </g>
  );
}
