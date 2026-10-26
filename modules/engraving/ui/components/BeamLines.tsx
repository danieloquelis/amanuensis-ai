import type { Beam } from "../../domain/scene";

export function BeamLines({ beams }: { beams: Beam[] }) {
  return beams.map((beam) => (
    <line
      key={`${beam.x1}-${beam.level}`}
      x1={beam.x1}
      x2={beam.x2}
      y1={beam.y}
      y2={beam.y}
      stroke="currentColor"
      strokeWidth="4"
      pointerEvents="none"
    />
  ));
}
