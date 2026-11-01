import { TUPLET_HALF_HEIGHT, type TupletMark } from "../../domain/scene";

/** The "3", and the gap left for it in a bracket. */
const NUMBER_SIZE = 13;
const NUMBER_GAP = 8;
/** The number's baseline sits this far below its centre, so it reads as centred on `y`. */
const BASELINE_DROP = 4.5;
const BRACKET_STROKE = 1;

/**
 * Triplets: an italic "3" centred over or under the group, with a bracket from first to last head
 * when the group is not beamed on its own. The bracket's hooks point toward the notes.
 */
export function TupletMarks({ tuplets }: { tuplets: TupletMark[] }) {
  return tuplets.map((mark) => {
    const middle = (mark.x1 + mark.x2) / 2;
    // A bracket line runs at the side of the mark away from the notes; its hooks reach back toward them.
    const hook = mark.above ? TUPLET_HALF_HEIGHT : -TUPLET_HALF_HEIGHT;
    return (
      <g key={mark.id} pointerEvents="none" aria-hidden="true">
        {mark.bracket && (
          <path
            d={`M ${mark.x1} ${mark.y + hook} V ${mark.y} H ${middle - NUMBER_GAP} M ${middle + NUMBER_GAP} ${mark.y} H ${mark.x2} V ${mark.y + hook}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={BRACKET_STROKE}
          />
        )}
        <text
          x={middle}
          y={mark.y + BASELINE_DROP}
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontWeight="bold"
          fontSize={NUMBER_SIZE}
          fill="currentColor"
        >
          3
        </text>
      </g>
    );
  });
}
