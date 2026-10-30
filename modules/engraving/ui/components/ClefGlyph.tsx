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

/** Two thick bars over the middle of the staff. */
function PercussionClef({ top }: { top: number }) {
  return (
    <g fill="currentColor">
      <rect x={CLEF_X + 8} y={top + STAFF_GAP} width="4.5" height={STAFF_GAP * 2} />
      <rect x={CLEF_X + 17} y={top + STAFF_GAP} width="4.5" height={STAFF_GAP * 2} />
    </g>
  );
}
