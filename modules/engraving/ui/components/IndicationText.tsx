import type { SVGProps } from "react";
import type { SceneLabel } from "../../domain/scene";

type IndicationTextProps = { label: SceneLabel } & SVGProps<SVGTextElement>;

/** A text indication (italic) or dynamic (bold italic). Extra SVG props land on the text. */
export function IndicationText({ label, ...rest }: IndicationTextProps) {
  const dynamic = label.kind === "dynamic";
  return (
    <text
      x={label.x}
      y={label.y}
      fontFamily="Georgia, serif"
      fontStyle="italic"
      fontWeight={dynamic ? "bold" : "normal"}
      fontSize={dynamic ? 18 : 12}
      {...rest}
    >
      {label.text}
    </text>
  );
}
