/** Sharp (1), flat (-1) or natural (0). `x` is the glyph's origin; `y` the staff position it marks. */
export function AccidentalGlyph({ value, x, y }: { value: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke="currentColor" fill="none" strokeWidth="1.5">
      {value === 1 ? (
        <>
          <path d="M 1 -12 V 12 M 7 -14 V 10" />
          <path d="M -3 -4 L 11 -7 M -3 5 L 11 2" strokeWidth="3.5" />
        </>
      ) : value === -1 ? (
        <path d="M 0 -19 V 9 C 15 1, 11 -10, 0 -2" strokeWidth="2" />
      ) : (
        <>
          <path d="M 0 -14 V 7 L 7 4 V -8 L 0 -5 M 7 4 V 14" />
          <path d="M 0 -5 L 7 -8 M 0 7 L 7 4" strokeWidth="3" />
        </>
      )}
    </g>
  );
}
