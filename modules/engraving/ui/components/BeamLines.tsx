import { BEAM_THICKNESS } from "../../domain/beams";
import type { Beam } from "../../domain/scene";

/** Beams as parallelograms: vertical ends, thickness growing from the stem tips toward the notes. */
export function BeamLines({ beams }: { beams: Beam[] }) {
  return beams.map((beam) => {
    const inward = beam.down ? -BEAM_THICKNESS : BEAM_THICKNESS;
    const points = [
      [beam.x1, beam.y1],
      [beam.x2, beam.y2],
      [beam.x2, beam.y2 + inward],
      [beam.x1, beam.y1 + inward],
    ];
    return (
      <polygon
        key={`${beam.x1},${beam.y1}-${beam.level}`}
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="currentColor"
        pointerEvents="none"
      />
    );
  });
}
