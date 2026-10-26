import { durationNotation, type Articulation } from "@/modules/score";
import { STAFF_GAP, stemX, type EngravedEvent } from "../../domain/scene";
import styles from "./glyphs.module.css";

const FLAG_PATH = "M 0 0 C 18 10 16 24 7 29 C 14 14 4 13 0 9 Z";
const SECOND_FLAG_OFFSET = 7;

/**
 * Draws one engraved note, rest or empty space: ledger lines, accidental, notehead, stem, flags,
 * augmentation dot and articulation. Purely presentational; colour comes from `currentColor`.
 */
export function EventGlyph({ item, systemTop, beamed }: { item: EngravedEvent; systemTop: number; beamed: boolean }) {
  const { event, x, y } = item;
  const notation = durationNotation(event.duration);
  return (
    <>
      {item.ledgerLines.map((lineY) => (
        <line key={lineY} x1={x - 13} x2={x + 13} y1={lineY} y2={lineY} stroke="currentColor" strokeWidth="1.1" />
      ))}
      {event.gap ? (
        <EmptySpace x={x} y={y} />
      ) : event.pitch ? (
        <NoteGlyph item={item} beamed={beamed} />
      ) : (
        <RestGlyph item={item} />
      )}
      {notation.dotted && !event.measureRest && <AugmentationDot x={x} y={y} systemTop={systemTop} />}
      {event.articulation && (
        <ArticulationMark articulation={event.articulation} x={x} y={Math.min(y - 18, systemTop - 12)} />
      )}
    </>
  );
}

function NoteGlyph({ item, beamed }: { item: EngravedEvent; beamed: boolean }) {
  const { x, y } = item;
  const { base } = durationNotation(item.event.duration);
  const hollow = base >= 2;
  const stem = stemX(item);
  const flagDirection = item.stemDown ? -1 : 1;
  return (
    <>
      {item.accidental !== null && <Accidental value={item.accidental} x={x} y={y} />}
      <ellipse
        cx={x}
        cy={y}
        rx={base === 4 ? 9 : 7.5}
        ry="5.1"
        transform={`rotate(-20 ${x} ${y})`}
        fill={hollow ? "var(--paper)" : "currentColor"}
        stroke="currentColor"
        strokeWidth={hollow ? 2.1 : 0.8}
      />
      {base < 4 && <line x1={stem} x2={stem} y1={y} y2={item.stemEnd} stroke="currentColor" strokeWidth="1.5" />}
      {base <= 0.5 && !beamed && (
        <path
          transform={`translate(${stem} ${item.stemEnd}) scale(${flagDirection})`}
          d={FLAG_PATH}
          fill="currentColor"
        />
      )}
      {base === 0.25 && !beamed && (
        <path
          transform={`translate(${stem} ${item.stemEnd + (item.stemDown ? -SECOND_FLAG_OFFSET : SECOND_FLAG_OFFSET)}) scale(${flagDirection})`}
          d={FLAG_PATH}
          fill="currentColor"
        />
      )}
    </>
  );
}

function RestGlyph({ item }: { item: EngravedEvent }) {
  const value = item.event.measureRest ? 4 : durationNotation(item.event.duration).base;
  const { x, y } = item;
  if (value >= 2) {
    return <rect x={x - 7} y={y + (value === 4 ? -12 : -6)} width="14" height="6" fill="currentColor" />;
  }
  if (value <= 0.5) {
    return (
      <g stroke="currentColor" fill="currentColor">
        <circle cx={x - 3} cy={y - 4} r="3.5" />
        {value === 0.25 && <circle cx={x - 6} cy={y + 4} r="3.5" />}
        <path
          d={`M ${x - 3} ${y - 4} Q ${x + 2} ${y + 1} ${x + 7} ${y - 7} L ${x + 1} ${y + 15}`}
          fill="none"
          strokeWidth="2"
        />
      </g>
    );
  }
  return (
    <path
      d={`M ${x - 4} ${y - 15} L ${x + 5} ${y - 6} L ${x} ${y + 2} L ${x + 5} ${y + 10} Q ${x - 9} ${y + 4} ${x - 2} ${y + 17} Q ${x - 13} ${y + 7} ${x - 4} ${y + 4} L ${x - 9} ${y - 3} L ${x - 3} ${y - 10} Z`}
      fill="currentColor"
    />
  );
}

/** Editable space left by a shortened note; shown as a faint plus, hidden in print. */
function EmptySpace({ x, y }: { x: number; y: number }) {
  return (
    <g className={styles.emptySpace} data-glyph="empty-space">
      <circle cx={x} cy={y} r="9" />
      <path d={`M ${x - 4} ${y} H ${x + 4} M ${x} ${y - 4} V ${y + 4}`} />
    </g>
  );
}

function Accidental({ value, x, y }: { value: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x - 22} ${y})`} stroke="currentColor" fill="none" strokeWidth="1.5">
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

/** Dots on a line move up into the space above. */
function AugmentationDot({ x, y, systemTop }: { x: number; y: number; systemTop: number }) {
  const onLine = y % STAFF_GAP === systemTop % STAFF_GAP;
  return <circle cx={x + 14} cy={y - (onLine ? 5 : 0)} r="2" fill="currentColor" />;
}

function ArticulationMark({ articulation, x, y }: { articulation: Articulation; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-label={articulation}>
      {articulation === "staccato" && <circle r="2.5" fill="currentColor" />}
      {articulation === "accent" && (
        <path d="M -7 -4 L 7 0 L -7 4" stroke="currentColor" fill="none" strokeWidth="1.5" />
      )}
      {articulation === "tenuto" && <path d="M -6 0 H 6" stroke="currentColor" strokeWidth="1.5" />}
      {articulation === "fermata" && (
        <>
          <path d="M -9 0 Q 0 -16 9 0" stroke="currentColor" fill="none" strokeWidth="1.5" />
          <circle cy="-2" r="2" fill="currentColor" />
        </>
      )}
    </g>
  );
}
