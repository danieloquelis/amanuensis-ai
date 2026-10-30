import type { System } from "../../domain/scene";
import { nameRight, stavesLeft, systemBottom } from "../../domain/staff-layout";
import { ClefGlyph } from "./ClefGlyph";
import { KeySignature, StaffLines } from "./StaffGlyphs";
import styles from "./glyphs.module.css";

/** The bracket's thick line sits this far left of the staves; a brace's right edge this far. */
const BRACKET_OFFSET = 5;
const BRACE_OFFSET = 9;
const BRACE_DEPTH = 9;
const BRACKET_HOOK = 7;

/**
 * Every staff of a system with its clef and key signature. With several staves, a line joins them
 * at the start; a grand staff gets a brace, several parts a bracket and their names.
 */
export function SystemStaves({ system }: { system: System }) {
  const left = stavesLeft(system);
  const staves = system.staves ?? [
    { staffId: "", top: system.top, clef: system.clef, keySignature: system.keySignature },
  ];
  const parts = staves.filter((staff) => staff.barlineEnd !== undefined).length;
  const bottom = systemBottom(system);
  return (
    <g>
      {staves.map((staff) => (
        <g key={staff.staffId}>
          <StaffLines top={staff.top} endX={system.endX} left={left} />
          <ClefGlyph clef={staff.clef} top={staff.top} indent={system.indent} />
          <KeySignature marks={staff.keySignature} />
          {staff.brace && <Brace right={left - BRACE_OFFSET} top={staff.top} bottom={staff.barlineEnd!} />}
          {staff.name && (
            <text x={nameRight(system)} y={staff.name.y} textAnchor="end" className={styles.partName}>
              {staff.name.text}
            </text>
          )}
        </g>
      ))}
      {staves.length > 1 && <line x1={left} x2={left} y1={system.top} y2={bottom} className={styles.barline} />}
      {parts > 1 && <Bracket x={left - BRACKET_OFFSET} top={system.top} bottom={bottom} />}
    </g>
  );
}

/** A curly brace from `top` to `bottom`, its point to the left. */
function Brace({ right, top, bottom }: { right: number; top: number; bottom: number }) {
  const h = bottom - top;
  const mid = (top + bottom) / 2;
  const tip = right - BRACE_DEPTH;
  const d = [
    `M ${right} ${top}`,
    `C ${tip} ${top + h * 0.08}, ${right - 1} ${mid - h * 0.12}, ${tip} ${mid}`,
    `C ${right - 1} ${mid + h * 0.12}, ${tip} ${bottom - h * 0.08}, ${right} ${bottom}`,
    `C ${right - 6} ${bottom - h * 0.1}, ${right + 1} ${mid + h * 0.1}, ${tip + 2} ${mid}`,
    `C ${right + 1} ${mid - h * 0.1}, ${right - 6} ${top + h * 0.1}, ${right} ${top}`,
    "Z",
  ].join(" ");
  return <path d={d} fill="currentColor" />;
}

/** A thick line with hooks at both ends, grouping every part of the system. */
function Bracket({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  return (
    <g fill="none" stroke="currentColor">
      <line x1={x} x2={x} y1={top - 2} y2={bottom + 2} strokeWidth="3" />
      <path d={`M ${x - 1.5} ${top - 2} q ${BRACKET_HOOK} 0 ${BRACKET_HOOK + 2} -5`} strokeWidth="1.5" />
      <path d={`M ${x - 1.5} ${bottom + 2} q ${BRACKET_HOOK} 0 ${BRACKET_HOOK + 2} 5`} strokeWidth="1.5" />
    </g>
  );
}
