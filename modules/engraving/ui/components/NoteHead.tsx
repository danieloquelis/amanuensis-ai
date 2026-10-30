import { DRUM_PIECES, type DrumHead, type ScoreEvent } from "@/modules/score";

/** Half the width and height of an x or diamond head, and the circle round a side stick's x. */
const CROSS = 4.6;
const DIAMOND = { x: 6.5, y: 5.6 };
const CIRCLE_RADIUS = 6.6;
/** The "o" of an open hi-hat sits this far above the stem end (or the top head). */
const OPEN_MARK = { gap: 9, radius: 3.4 };

type NoteHeadProps = { shape: DrumHead; x: number; y: number; hollow: boolean; whole: boolean };

/** One notehead: an oval, or a drum's x, circled x or diamond. */
export function NoteHead({ shape, x, y, hollow, whole }: NoteHeadProps) {
  if (shape === "x" || shape === "circle-x") {
    return (
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none">
        <line x1={x - CROSS} y1={y - CROSS} x2={x + CROSS} y2={y + CROSS} />
        <line x1={x - CROSS} y1={y + CROSS} x2={x + CROSS} y2={y - CROSS} />
        {shape === "circle-x" && <circle cx={x} cy={y} r={CIRCLE_RADIUS} strokeWidth="1.2" />}
      </g>
    );
  }
  if (shape === "diamond") {
    const points = [
      [x - DIAMOND.x, y],
      [x, y - DIAMOND.y],
      [x + DIAMOND.x, y],
      [x, y + DIAMOND.y],
    ];
    return (
      <polygon
        points={points.map((p) => p.join(",")).join(" ")}
        fill={hollow ? "var(--paper)" : "currentColor"}
        stroke="currentColor"
        strokeWidth={hollow ? 1.8 : 0.8}
      />
    );
  }
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={whole ? 9 : 7.5}
      ry="5.1"
      transform={`rotate(-20 ${x} ${y})`}
      fill={hollow ? "var(--paper)" : "currentColor"}
      stroke="currentColor"
      strokeWidth={hollow ? 2.1 : 0.8}
    />
  );
}

/** Each head's shape, lowest first: a drum hit's pieces are stored in the order its heads are drawn. */
export const headShapes = (event: ScoreEvent, count: number): DrumHead[] =>
  Array.from({ length: count }, (_, k) => (event.drums ? DRUM_PIECES[event.drums[k]].head : "normal"));

/** The small "o" over an open hi-hat. */
export function OpenHatMark({ x, y }: { x: number; y: number }) {
  return (
    <circle cx={x} cy={y - OPEN_MARK.gap} r={OPEN_MARK.radius} fill="none" stroke="currentColor" strokeWidth="1.3" />
  );
}
