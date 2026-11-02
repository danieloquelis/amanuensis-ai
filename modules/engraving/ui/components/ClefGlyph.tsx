import type { Clef } from "@/modules/score";
import { STAFF_GAP } from "../../domain/scene";
import { TrebleClef } from "./StaffGlyphs";

/** Where the clef starts, matching the treble clef's left edge. */
const CLEF_X = 50;
/** The small 8 under an octave-lower treble clef sits below the clef's tail. */
const OCTAVE_MARK = { dx: 13, dy: 90, size: 11 };

/** The clef at the start of every system, `indent` right of the usual place. Original vector geometry, like the treble clef. */
export function ClefGlyph({ clef, top, indent = 0 }: { clef: Clef; top: number; indent?: number }) {
  if (indent) {
    return (
      <g transform={`translate(${indent} 0)`}>
        <ClefGlyph clef={clef} top={top} />
      </g>
    );
  }
  if (clef === "bass") return <BassClef top={top} />;
  if (clef === "percussion") return <PercussionClef top={top} />;
  if (clef === "alto") return <AltoClef top={top} />;
  return (
    <>
      <TrebleClef top={top} />
      {clef === "treble8vb" && (
        <text
          x={CLEF_X + OCTAVE_MARK.dx}
          y={top + OCTAVE_MARK.dy}
          fontSize={OCTAVE_MARK.size}
          fontStyle="italic"
          textAnchor="middle"
          fill="currentColor"
        >
          8
        </text>
      )}
    </>
  );
}

/** F clef: its head and two dots sit around the second line from the top (F3). */
function BassClef({ top }: { top: number }) {
  const fLine = top + STAFF_GAP;
  return (
    <g transform={`translate(${CLEF_X} ${fLine})`} fill="currentColor">
      <circle cx="5" cy="0" r="4.6" />
      <path
        d="M 1.5 -2 C 3 -13, 25 -15, 28 1 C 30 17, 17 31, 0 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="36" cy={-STAFF_GAP / 2} r="2.4" />
      <circle cx="36" cy={STAFF_GAP / 2} r="2.4" />
    </g>
  );
}

/** The C clef's upper curl: from its ball near the top line, round to a point on the middle line. */
const C_CURL = "M 17 -17 C 18 -23, 26 -26, 31 -22 C 37 -18, 36 -6, 29 -4 C 24 -3, 19 -4, 14 0";
const C_BALL = { cx: 19, cy: -15, r: 3.8 };

/** C clef: a thick and a thin bar the height of the staff, and two curls meeting on the middle line (C4). */
function AltoClef({ top }: { top: number }) {
  const height = STAFF_GAP * 4;
  return (
    <g transform={`translate(${CLEF_X + 1} ${top + height / 2})`} fill="currentColor">
      <rect x="0" y={-height / 2} width="6" height={height} />
      <rect x="10" y={-height / 2} width="2" height={height} />
      {/* The lower curl mirrors the upper one. */}
      {[1, -1].map((flip) => (
        <g key={flip} transform={`scale(1 ${flip})`}>
          <path d={C_CURL} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          <circle {...C_BALL} />
        </g>
      ))}
    </g>
  );
}

/** Two thick bars over the middle of the staff. */
function PercussionClef({ top }: { top: number }) {
  return (
    <g fill="currentColor">
      <rect x={CLEF_X + 8} y={top + STAFF_GAP} width="4.5" height={STAFF_GAP * 2} />
      <rect x={CLEF_X + 17} y={top + STAFF_GAP} width="4.5" height={STAFF_GAP * 2} />
    </g>
  );
}
