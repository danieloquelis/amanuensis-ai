import { LineIcon } from "../toolbar/LineIcon";

/** Two noteheads on one stem, with a + (add a note) or − (remove the top note) beside them. */
export function ChordNoteIcon({ size, change }: { size: number; change: "add" | "remove" }) {
  return (
    <LineIcon size={size}>
      <path d="M172 200V40" />
      <ellipse cx="136" cy="200" rx="36" ry="22" transform="rotate(-20 136 200)" />
      <ellipse cx="136" cy="148" rx="36" ry="22" transform="rotate(-20 136 148)" />
      <path d={change === "add" ? "M40 72h64M72 40v64" : "M40 72h64"} />
    </LineIcon>
  );
}

/** A quarter rest. */
export function RestIcon({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <path
        transform="translate(128 124) scale(6.4)"
        d="M -4 -15 L 5 -6 L 0 2 L 5 10 Q -9 4 -2 17 Q -13 7 -4 4 L -9 -3 L -3 -10 Z"
        fill="currentColor"
        stroke="none"
      />
    </LineIcon>
  );
}
