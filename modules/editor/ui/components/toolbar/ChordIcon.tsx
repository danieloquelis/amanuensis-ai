import { LineIcon } from "./LineIcon";

/** Notehead positions of a triad, a third apart, bottom to top. */
const HEADS = [196, 140, 84];

/** A chord: three noteheads stacked a third apart on one stem, drawn in outline like the other icons. */
export function ChordIcon({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <path d="M164 196V24" />
      {HEADS.map((y) => (
        <ellipse key={y} cx="122" cy={y} rx="38" ry="22" transform={`rotate(-20 122 ${y})`} />
      ))}
    </LineIcon>
  );
}
