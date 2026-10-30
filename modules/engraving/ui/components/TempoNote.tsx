import type { SVGProps } from "react";

type TempoNoteProps = { note: "quarter" | "half" } & SVGProps<SVGSVGElement>;

/** The note a tempo is counted in, drawn (fonts rarely have a half note): a head, hollow for a half, and its stem. */
export function TempoNote({ note, ...rest }: TempoNoteProps) {
  const hollow = note === "half";
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" aria-label={`${note} note`} role="img" {...rest}>
      <ellipse
        cx="3.4"
        cy="10.4"
        rx="3"
        ry="2.1"
        transform="rotate(-20 3.4 10.4)"
        fill={hollow ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={hollow ? 1.2 : 0}
      />
      <line x1="6.2" x2="6.2" y1="0.6" y2="9.8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
