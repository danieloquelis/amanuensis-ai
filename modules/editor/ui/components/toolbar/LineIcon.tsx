import type { ReactNode } from "react";

/** Line drawings in Phosphor's regular style (256 grid, 16-unit rounded strokes) for icons it lacks. */
export function LineIcon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
