import type { TieArc } from "../../domain/scene";

/** How far the arc's middle bulges from its ends, by length. */
const DEPTH = { min: 2.5, max: 10, perUnit: 0.12 };
/** Ink at the arc's middle, at most a share of the depth so short arcs stay flat; the ends taper to a point. */
const THICKNESS = { max: 2, ofDepth: 0.6 };

/**
 * Ties as filled crescents: two quadratic curves sharing their ends. A quadratic's middle
 * reaches half its control point's offset, hence the doubled depths.
 */
export function TieArcs({ ties }: { ties: TieArc[] }) {
  return ties.map((tie) => {
    const depth = Math.min(DEPTH.max, Math.max(DEPTH.min, (tie.x2 - tie.x1) * DEPTH.perUnit));
    const direction = tie.above ? -1 : 1;
    const middle = (tie.x1 + tie.x2) / 2;
    const outer = tie.y + direction * 2 * depth;
    const thickness = Math.min(THICKNESS.max, depth * THICKNESS.ofDepth);
    const inner = tie.y + direction * 2 * (depth - thickness);
    return (
      <path
        key={tie.id}
        d={`M ${tie.x1} ${tie.y} Q ${middle} ${outer} ${tie.x2} ${tie.y} Q ${middle} ${inner} ${tie.x1} ${tie.y} Z`}
        fill="currentColor"
        pointerEvents="none"
      />
    );
  });
}
