import type { MouseEvent } from "react";
import type { BarScene, System } from "@/modules/engraving";
import { BarNumber, Barline, RepeatEnd, RepeatStart, TempoMark, TimeSignature } from "@/modules/engraving/ui";
import { MEASURE_WIDTH, meterName, type Score } from "@/modules/score";
import { clampMeasureWidth, MEASURE_WIDTH_STEP, measureWidth } from "../../../application/bar-spacing";
import { firstEventOfMeasure } from "../../../application/selection";
import styles from "./score-surface.module.css";
import { isMenuKey, type SheetInteractions } from "./sheet-interactions";

/** Clef and key space before the first bar's time signature. */
const FIRST_METER_X = 94;
const METER_OFFSET_IN_BAR = 22;

type SheetBarProps = {
  bar: BarScene;
  system: System;
  isFirstInSystem: boolean;
  score: Score;
  interactions: SheetInteractions;
};

/**
 * Bar furniture: number, time signature, barline, tempo and repeat marks. The barline between
 * the two bars of a system is a slider that adjusts spacing; other barlines open bar actions.
 */
export function SheetBar({ bar, system, isFirstInSystem, score, interactions }: SheetBarProps) {
  const { select, commit, openMenu, gestures } = interactions;
  const top = system.top;
  const measure = score.measures[bar.number - 1];
  const resizable = isFirstInSystem && system.bars.length === 2;
  const selectBar = () => select(firstEventOfMeasure(score, bar.number - 1));
  const openBarMenu = (e: MouseEvent) => {
    e.preventDefault();
    openMenu("bar", bar.id, e.clientX, e.clientY);
  };
  const setWidth = (width: number | null) =>
    commit(
      { type: "setMeasureWidth", measureId: bar.id, width },
      width === null ? "Reset bar spacing" : "Adjusted bar spacing",
    );

  return (
    <g onContextMenu={openBarMenu}>
      <BarNumber
        bar={bar}
        top={top}
        className={styles.barNumber}
        role="button"
        tabIndex={0}
        aria-label={`Select bar ${bar.number}`}
        onContextMenu={openBarMenu}
        onClick={selectBar}
        onKeyDown={(e) => {
          if (e.key === "Enter") selectBar();
        }}
      />
      {bar.showMeter && (
        <TimeSignature
          meter={bar.meter}
          x={isFirstInSystem ? FIRST_METER_X : bar.x + METER_OFFSET_IN_BAR}
          top={top}
          className={styles.meter}
          role="button"
          tabIndex={0}
          aria-label={`Time signature ${meterName(bar.meter)} at bar ${bar.number}`}
          onClick={(e) => {
            selectBar();
            openMenu("bar", bar.id, e.clientX, e.clientY);
          }}
          onContextMenu={openBarMenu}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const rect = e.currentTarget.getBoundingClientRect();
            openMenu("bar", bar.id, rect.right, rect.bottom);
          }}
        />
      )}
      <Barline x={bar.endX} top={top} />
      <g
        className={resizable ? styles.divider : styles.barTarget}
        role={resizable ? "slider" : "button"}
        tabIndex={0}
        aria-label={resizable ? `Resize bar ${bar.number}` : `Bar ${bar.number} actions`}
        aria-valuemin={isFirstInSystem ? MEASURE_WIDTH.min : undefined}
        aria-valuemax={isFirstInSystem ? MEASURE_WIDTH.max : undefined}
        aria-valuenow={isFirstInSystem ? measureWidth(measure) : undefined}
        onContextMenu={(e) => {
          e.preventDefault();
          selectBar();
          openMenu("bar", bar.id, e.clientX, e.clientY);
        }}
        onDoubleClick={() => setWidth(null)}
        onKeyDown={(e) => {
          if (isMenuKey(e)) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            openMenu("bar", bar.id, rect.right, rect.top);
          }
          if (resizable && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? MEASURE_WIDTH_STEP : -MEASURE_WIDTH_STEP;
            setWidth(clampMeasureWidth(measureWidth(measure) + step));
          }
        }}
        onPointerDown={(e) => {
          if (resizable) gestures.startBarDrag(e, bar);
        }}
        onPointerMove={(e) => gestures.moveBarDrag(e, bar.id)}
        onPointerUp={gestures.finishGesture}
        onPointerCancel={gestures.cancelGesture}
      >
        <rect x={bar.endX - 9} y={top - 8} width="18" height="64" fill="transparent" />
        <line x1={bar.endX} x2={bar.endX} y1={top - 6} y2={top + 54} className={styles.dividerHighlight} />
      </g>
      {bar.tempo && <TempoMark bar={bar} top={top} />}
      {bar.repeatStart && <RepeatStart bar={bar} top={top} />}
      {bar.repeatEnd && <RepeatEnd bar={bar} top={top} />}
    </g>
  );
}
