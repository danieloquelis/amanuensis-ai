import type { SVGProps } from "react";
import { MARK_LABELS, type EndMark, type StartMark } from "@/modules/score";
import { MIDDLE_LINE, positionY, type BarScene } from "../../domain/scene";

const MARK_FONT = { fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 13 } as const;

/** Rhythm slashes on the middle line: "play freely on the chord". */
export function SlashBar({ bar, top }: { bar: BarScene; top: number }) {
  const y = positionY(top, MIDDLE_LINE);
  return bar.slashXs.map((x) => (
    <polygon
      key={x}
      points={`${x - 7},${y + 9} ${x - 2},${y + 9} ${x + 7},${y - 9} ${x + 2},${y - 9}`}
      fill="currentColor"
    />
  ));
}

/** Measure-repeat sign (%): play the previous bar again. */
export function MeasureRepeatSign({ bar, top }: { bar: BarScene; top: number }) {
  const x = (bar.x + bar.endX) / 2;
  const y = positionY(top, MIDDLE_LINE);
  return (
    <g fill="currentColor">
      <polygon points={`${x - 12},${y + 10} ${x - 6},${y + 10} ${x + 12},${y - 10} ${x + 6},${y - 10}`} />
      <circle cx={x - 9} cy={y - 6} r="2.6" />
      <circle cx={x + 9} cy={y + 6} r="2.6" />
    </g>
  );
}

/** Boxed rehearsal mark ("A", "Verse"). Extra SVG props land on the root group. */
export function SectionMark({ label, x, y, ...rest }: { label: string; x: number; y: number } & SVGProps<SVGGElement>) {
  const width = 12 + label.length * 9;
  return (
    <g {...rest}>
      <rect
        x={x}
        y={y - 15}
        width={width}
        height={20}
        rx="2"
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <text x={x + width / 2} y={y} textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold" fontSize="14">
        {label}
      </text>
    </g>
  );
}

function SegnoGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y - 9})`} fill="currentColor" stroke="currentColor">
      <path d="M 6 -7 C 0 -10 -5 -5 -1 -1 L 2 1 C 6 5 1 10 -5 7" fill="none" strokeWidth="2.4" />
      <path d="M -6 9 L 6 -9" strokeWidth="1.3" />
      <circle cx="-5" cy="-3" r="1.6" stroke="none" />
      <circle cx="5" cy="3" r="1.6" stroke="none" />
    </g>
  );
}

function CodaGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y - 7})`} stroke="currentColor" fill="none">
      <ellipse rx="6" ry="7.5" strokeWidth="2" />
      <path d="M 0 -11 V 11 M -10 0 H 10" strokeWidth="1.3" />
    </g>
  );
}

/** Segno or coda sign at a bar start. */
export function StartMarkGlyph({
  mark,
  x,
  y,
  ...rest
}: { mark: StartMark; x: number; y: number } & SVGProps<SVGGElement>) {
  return (
    <g aria-label={MARK_LABELS[mark]} {...rest}>
      {mark === "segno" ? <SegnoGlyph x={x + 8} y={y} /> : <CodaGlyph x={x + 10} y={y} />}
    </g>
  );
}

/** Fine, To Coda, D.C., D.S. — right-aligned at a bar end. */
export function EndMarkText({ mark, x, y, ...rest }: { mark: EndMark; x: number; y: number } & SVGProps<SVGGElement>) {
  return (
    <g aria-label={MARK_LABELS[mark]} {...rest}>
      <text x={mark === "toCoda" ? x - 22 : x} y={y} textAnchor="end" {...MARK_FONT}>
        {MARK_LABELS[mark]}
      </text>
      {mark === "toCoda" && <CodaGlyph x={x - 9} y={y + 2} />}
    </g>
  );
}

/** Chord accidentals are drawn as raised "b"/"#", as in fake books: every font has them. */
const ACCIDENTAL = /([♭♯])/;
const ACCIDENTAL_TEXT: Record<string, string> = { "♭": "b", "♯": "#" };

/** A chord symbol: root, quality and bass in one line. Extra SVG props land on the text. */
export function ChordSymbol({
  text,
  x,
  y,
  ...rest
}: { text: string; x: number; y: number } & SVGProps<SVGTextElement>) {
  return (
    <text x={x} y={y} fontFamily="var(--font-geist-sans), sans-serif" fontWeight="600" fontSize="15" {...rest}>
      {text.split(ACCIDENTAL).map((part, index) =>
        ACCIDENTAL.test(part) ? (
          <tspan key={index} fontSize="11" dy="-5">
            {ACCIDENTAL_TEXT[part]}
          </tspan>
        ) : (
          <tspan key={index} dy={index > 0 ? 5 : 0}>
            {part}
          </tspan>
        ),
      )}
    </text>
  );
}
