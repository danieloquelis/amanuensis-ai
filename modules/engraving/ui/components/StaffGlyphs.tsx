import type { SVGProps } from "react";
import type { Meter } from "@/modules/score";
import { STAFF_GAP, STAFF_HEIGHT, STAFF_LINES_X, type BarScene } from "../../domain/scene";
import { classNames } from "@/shared/ui/class-names";
import styles from "./glyphs.module.css";

export function StaffLines({ top }: { top: number }) {
  return [0, 1, 2, 3, 4].map((line) => (
    <line
      key={line}
      x1={STAFF_LINES_X.start}
      x2={STAFF_LINES_X.end}
      y1={top + line * STAFF_GAP}
      y2={top + line * STAFF_GAP}
      className={styles.staffLine}
    />
  ));
}

/** Original vector geometry; the engraving surface has no font or renderer dependency. */
export function TrebleClef({ top }: { top: number }) {
  return (
    <g
      transform={`translate(55 ${top})`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M 9 36 C -8 26, 0 10, 10 1 C 22 -10, 24 -29, 16 -35 C 7 -29, 8 -13, 12 2 L 23 61 C 26 77, 8 81, 4 70"
        strokeWidth="2.6"
      />
      <path
        d="M 12 2 C 10 11, -10 22, -9 36 C -8 57, 28 61, 29 41 C 29 23, 5 20, 4 36 C 3 43, 10 48, 16 44"
        strokeWidth="3.8"
      />
      <ellipse cx="6" cy="69" rx="4.5" ry="5.5" fill="currentColor" stroke="none" />
    </g>
  );
}

export function Barline({ x, top }: { x: number; top: number }) {
  return <line x1={x} x2={x} y1={top} y2={top + STAFF_HEIGHT} className={styles.barline} />;
}

type TimeSignatureProps = { meter: Meter; x: number; top: number } & SVGProps<SVGGElement>;

/** Stacked meter digits. Extra SVG props (handlers, a11y) land on the root group. */
export function TimeSignature({ meter, x, top, ...rest }: TimeSignatureProps) {
  return (
    <g fontFamily="Georgia, serif" fontWeight="bold" fontSize="27" textAnchor="middle" fill="currentColor" {...rest}>
      <text x={x} y={top + 23}>
        {meter.numerator}
      </text>
      <text x={x} y={top + 47}>
        {meter.denominator}
      </text>
    </g>
  );
}

type BarNumberProps = { bar: BarScene; top: number } & SVGProps<SVGTextElement>;

export function BarNumber({ bar, top, className, ...rest }: BarNumberProps) {
  return (
    <text x={bar.x + 8} y={top - 34} className={classNames(styles.barNumber, className)} {...rest}>
      {String(bar.number).padStart(2, "0")}
    </text>
  );
}

export function TempoMark({ bar, top }: { bar: BarScene; top: number }) {
  return (
    <text x={bar.notesX} y={top - 16} fontSize="11">
      {`♩ = ${bar.tempo}`}
    </text>
  );
}

const REPEAT_DOT_OFFSETS = [18, 30];

export function RepeatStart({ bar, top }: { bar: BarScene; top: number }) {
  return (
    <g aria-label={`Repeat starts at bar ${bar.number}`}>
      <line x1={bar.x - 5} x2={bar.x - 5} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" strokeWidth="3" />
      <line x1={bar.x} x2={bar.x} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" />
      {REPEAT_DOT_OFFSETS.map((dy) => (
        <circle key={dy} cx={bar.x + 6} cy={top + dy} r="2" fill="currentColor" />
      ))}
    </g>
  );
}

export function RepeatEnd({ bar, top }: { bar: BarScene; top: number }) {
  return (
    <g aria-label={`Repeat ends at bar ${bar.number}, ${bar.repeatEnd} passes`}>
      <line x1={bar.endX - 5} x2={bar.endX - 5} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" />
      <line x1={bar.endX} x2={bar.endX} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" strokeWidth="3" />
      {REPEAT_DOT_OFFSETS.map((dy) => (
        <circle key={dy} cx={bar.endX - 12} cy={top + dy} r="2" fill="currentColor" />
      ))}
      <text x={bar.endX - 20} y={top - 16} fontSize="11">{`${bar.repeatEnd}×`}</text>
    </g>
  );
}
