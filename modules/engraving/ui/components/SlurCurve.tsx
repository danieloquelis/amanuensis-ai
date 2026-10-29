import type { SVGProps } from "react";
import type { SlurArc } from "../../domain/scene";

/** Ink at the slur's middle, at most a share of its depth; the ends taper to points. */
const THICKNESS = { max: 2.2, ofBulge: 0.4 };
/** Width of the invisible band around the curve that takes clicks. */
const HIT_WIDTH = 12;

/** The cubic from one end to the other with both controls `bulge` off the straight line. */
function curve(slur: SlurArc, bulge: number, reverse = false) {
  const third = (share: number) => ({
    x: slur.x1 + (slur.x2 - slur.x1) * share,
    y: slur.y1 + (slur.y2 - slur.y1) * share + bulge,
  });
  const [a, b] = reverse ? [third(2 / 3), third(1 / 3)] : [third(1 / 3), third(2 / 3)];
  const end = reverse ? `${slur.x1} ${slur.y1}` : `${slur.x2} ${slur.y2}`;
  return `C ${a.x} ${a.y} ${b.x} ${b.y} ${end}`;
}

type SlurCurveProps = { slur: SlurArc } & SVGProps<SVGGElement>;

/**
 * A slur as a filled crescent: out along one cubic and back along a flatter one. Extra SVG props
 * (handlers, a11y) land on the root group, which takes clicks along a band around the curve.
 */
export function SlurCurve({ slur, ...rest }: SlurCurveProps) {
  const thickness = Math.min(THICKNESS.max, Math.abs(slur.bulge) * THICKNESS.ofBulge);
  const inner = slur.bulge - Math.sign(slur.bulge) * thickness;
  const start = `M ${slur.x1} ${slur.y1}`;
  return (
    <g {...rest}>
      <path d={`${start} ${curve(slur, slur.bulge)}`} stroke="transparent" strokeWidth={HIT_WIDTH} fill="none" />
      <path
        d={`${start} ${curve(slur, slur.bulge)} ${curve(slur, inner, true)} Z`}
        fill="currentColor"
        pointerEvents="none"
      />
    </g>
  );
}
