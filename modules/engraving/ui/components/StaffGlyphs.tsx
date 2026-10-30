import type { SVGProps } from "react";
import { tempoMarking, type Meter } from "@/modules/score";
import { STAFF_GAP, STAFF_HEIGHT, STAFF_LEFT, type BarScene, type KeyAccidentalMark } from "../../domain/scene";
import { AccidentalGlyph } from "./AccidentalGlyph";
import { TempoNote } from "./TempoNote";
import { classNames } from "@/shared/ui/class-names";
import styles from "./glyphs.module.css";

/** Five lines from the system's left edge (after any indent for part names) to its last barline. */
export function StaffLines({ top, endX, left = STAFF_LEFT }: { top: number; endX: number; left?: number }) {
  return [0, 1, 2, 3, 4].map((line) => (
    <line
      key={line}
      x1={left}
      x2={endX}
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

/** A barline down one staff, or through a part's staves to `bottom`. */
export function Barline({ x, top, bottom = top + STAFF_HEIGHT }: { x: number; top: number; bottom?: number }) {
  return <line x1={x} x2={x} y1={top} y2={bottom} className={styles.barline} />;
}

/** Thin then thick line closing the score. */
export function FinalBarline({ x, top, bottom = top + STAFF_HEIGHT }: { x: number; top: number; bottom?: number }) {
  return (
    <g>
      <line x1={x - 7} x2={x - 7} y1={top} y2={bottom} className={styles.barline} />
      <rect x={x - 4} y={top} width="4" height={bottom - top} fill="currentColor" />
    </g>
  );
}

/** Key signature repeated after the clef on every system. */
export function KeySignature({ marks }: { marks: KeyAccidentalMark[] }) {
  // Glyph origins sit 3 units right of the mark's left edge (the sharp's crossbars reach left).
  return marks.map((mark) => <AccidentalGlyph key={mark.x} value={mark.alter} x={mark.x + 3} y={mark.y} />);
}

type TimeSignatureProps = { meter: Meter; x: number; top: number } & SVGProps<SVGGElement>;

/** The cut-time sign's vertical stroke reaches this far past the staff's outer lines. */
const CUT_STROKE_OVERHANG = 5;

/**
 * Stacked meter digits; cut time (2/2) as its sign, ₵. Extra SVG props (handlers, a11y) land on
 * the root group.
 */
export function TimeSignature({ meter, x, top, ...rest }: TimeSignatureProps) {
  if (meter.numerator === 2 && meter.denominator === 2) {
    return (
      <g fill="currentColor" {...rest}>
        <text x={x} y={top + 35} fontFamily="Georgia, serif" fontWeight="bold" fontSize="34" textAnchor="middle">
          C
        </text>
        <line
          x1={x}
          x2={x}
          y1={top - CUT_STROKE_OVERHANG}
          y2={top + STAFF_HEIGHT + CUT_STROKE_OVERHANG}
          stroke="currentColor"
          strokeWidth={2}
        />
      </g>
    );
  }
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

type BarNumberProps = { bar: BarScene; x?: number; y: number } & SVGProps<SVGTextElement>;

/** Bar number; defaults to just inside the bar's left barline. */
export function BarNumber({ bar, x = bar.x + 8, y, className, ...rest }: BarNumberProps) {
  return (
    <text x={x} y={y} className={classNames(styles.barNumber, className)} {...rest}>
      {String(bar.number).padStart(2, "0")}
    </text>
  );
}

/** "♩ = 96", or a half note = 100 in cut time; `y` is the text's baseline. */
export function TempoMark({ tempo, meter, x, y }: { tempo: number; meter: Meter; x: number; y: number }) {
  const { note, perMinute } = tempoMarking(tempo, meter);
  return (
    <g>
      <TempoNote note={note} x={x} y={y - 11} />
      <text x={x + 11} y={y} fontSize="12" fontWeight="600">
        {`= ${perMinute}`}
      </text>
    </g>
  );
}

const REPEAT_DOT_OFFSETS = [18, 30];

/** Thick line, thin line, then dots, starting at `x`. */
export function RepeatStart({ x, barNumber, top }: { x: number; barNumber: number; top: number }) {
  return (
    <g aria-label={`Repeat starts at bar ${barNumber}`}>
      <line x1={x} x2={x} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" strokeWidth="3" />
      <line x1={x + 5} x2={x + 5} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" />
      {REPEAT_DOT_OFFSETS.map((dy) => (
        <circle key={dy} cx={x + 11} cy={top + dy} r="2" fill="currentColor" />
      ))}
    </g>
  );
}

/** Thick line, thin line and dots ending at the barline; `count` shows the passes above (on the top staff). */
export function RepeatEnd({ bar, top, count = true }: { bar: BarScene; top: number; count?: boolean }) {
  return (
    <g aria-label={`Repeat ends at bar ${bar.number}, ${bar.repeatEnd} passes`}>
      <line x1={bar.endX - 5} x2={bar.endX - 5} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" />
      <line x1={bar.endX} x2={bar.endX} y1={top} y2={top + STAFF_HEIGHT} stroke="currentColor" strokeWidth="3" />
      {REPEAT_DOT_OFFSETS.map((dy) => (
        <circle key={dy} cx={bar.endX - 12} cy={top + dy} r="2" fill="currentColor" />
      ))}
      {count && <text x={bar.endX - 20} y={top - 16} fontSize="11">{`${bar.repeatEnd}×`}</text>}
    </g>
  );
}
