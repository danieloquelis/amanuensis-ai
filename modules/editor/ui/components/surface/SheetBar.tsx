import type { KeyboardEvent, MouseEvent } from "react";
import { STAFF_LEFT, type BarScene, type System } from "@/modules/engraving";

import { BarNumber, Barline, FinalBarline, RepeatEnd, RepeatStart, TimeSignature } from "@/modules/engraving/ui";
import { MEASURE_WIDTH, meterName } from "@/modules/score";
import { clampMeasureWidth, MEASURE_WIDTH_STEP } from "../../../application/bar-spacing";
import styles from "./score-surface.module.css";
import { BarMarks } from "./BarMarks";
import { isMenuKey, pickModeOf, selectableItem, type SheetInteractions } from "./sheet-interactions";

const repeatClasses = { selected: styles.itemSelected, base: styles.annotation };

type SheetBarProps = {
  bar: BarScene;
  system: System;
  isFirstInSystem: boolean;
  isLastInSystem: boolean;
  interactions: SheetInteractions;
};

/**
 * Bar furniture: number, time signature, barline, repeats and lead-sheet marks. A barline inside
 * a system is a slider that sets the bar's width (the rest of the line re-justifies); the barline
 * that ends a system opens bar actions. Bar numbers show at line starts, others on hover.
 */
export function SheetBar({ bar, system, isFirstInSystem, isLastInSystem, interactions }: SheetBarProps) {
  const { commit, openMenu, gestures } = interactions;
  const top = system.top;
  const resizable = !isLastInSystem;
  const width = Math.round(bar.width);
  const { selectBar: selectBarById, deleteBar } = interactions;
  const selectBar = () => selectBarById(bar.id);
  /** Delete removes a selected bar; Escape deselects it. */
  const onBarKey = (e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteBar(bar.id);
    }
    if (e.key === "Escape") selectBarById(null);
  };
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
        // Line-start numbers sit left of the staff, clear of section boxes and chords.
        x={isFirstInSystem ? STAFF_LEFT : undefined}
        y={isFirstInSystem ? system.markY : top - 34}
        className={isFirstInSystem ? styles.barNumber : `${styles.barNumber} ${styles.hoverOnly}`}
        role="button"
        tabIndex={0}
        aria-label={`Select bar ${bar.number}`}
        onContextMenu={openBarMenu}
        onClick={(e) => {
          const mode = pickModeOf(e);
          if (mode) interactions.pick({ kind: "bar", id: bar.id }, mode);
          else selectBar();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") selectBar();
          if (e.key === "Delete" || e.key === "Backspace") onBarKey(e);
        }}
      />
      {bar.meterX !== null && (
        <TimeSignature
          meter={bar.meter}
          x={bar.meterX}
          top={top}
          className={styles.meter}
          role="button"
          tabIndex={0}
          aria-label={`Time signature ${meterName(bar.meter)} at bar ${bar.number}`}
          onClick={(e) => {
            selectBar();
            openMenu("meter", bar.id, e.clientX, e.clientY);
          }}
          onContextMenu={openBarMenu}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const rect = e.currentTarget.getBoundingClientRect();
            openMenu("meter", bar.id, rect.right, rect.bottom);
          }}
        />
      )}
      {bar.final && !bar.repeatEnd ? <FinalBarline x={bar.endX} top={top} /> : <Barline x={bar.endX} top={top} />}
      <g
        className={resizable ? styles.divider : styles.barTarget}
        role={resizable ? "slider" : "button"}
        tabIndex={0}
        aria-label={resizable ? `Resize bar ${bar.number}` : `Bar ${bar.number} actions`}
        aria-valuemin={resizable ? MEASURE_WIDTH.min : undefined}
        aria-valuemax={resizable ? MEASURE_WIDTH.max : undefined}
        aria-valuenow={resizable ? width : undefined}
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
            setWidth(clampMeasureWidth(width + step));
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
      <BarMarks bar={bar} system={system} interactions={interactions} />
      {bar.repeatStartX !== null && bar.repeatStartId && (
        <g {...selectableItem(interactions, { kind: "repeat", id: bar.repeatStartId }, "Repeat", repeatClasses)}>
          <RepeatStart x={bar.repeatStartX} barNumber={bar.number} top={top} />
        </g>
      )}
      {bar.repeatEnd && bar.repeatEndId && (
        <g {...selectableItem(interactions, { kind: "repeat", id: bar.repeatEndId }, "Repeat", repeatClasses)}>
          <RepeatEnd bar={bar} top={top} />
        </g>
      )}
    </g>
  );
}
