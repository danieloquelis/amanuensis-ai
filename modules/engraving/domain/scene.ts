import type { Clef, MarkKind, Meter, Pitch, ScoreEvent } from "@/modules/score";

/** One placed note, rest or space. Coordinates are SVG scene units (12 per staff space). */
export type EngravedEvent = {
  event: ScoreEvent;
  x: number;
  y: number;
  /** Absolute beat in the score. */
  beat: number;
  /** Beat within the measure. */
  localBeat: number;
  /** Measure index in the score. */
  measure: number;
  stemDown: boolean;
  stemEnd: number;
  ledgerLines: number[];
  /** Accidental to draw (-1, 0 for natural, 1), or null when the key and bar already imply it. */
  accidental: number | null;
  /** Horizontal ink extent, including accidental, dot and flag. Used for collision checks. */
  left: number;
  right: number;
  /** The bar's whole-bar rest behind a slash or repeat display: selectable, not drawn. */
  hidden: boolean;
  /** The note sounds outside its instrument's range: drawn in the warning colour. */
  outOfRange?: true;
  /** The pitch it sounds, when the staff shows a transposing part as written (`event.pitch` is written). */
  sounds?: Pitch;
};

/** A beam segment. `y1`/`y2` are the stem tips (outer edge); thickness grows toward the noteheads. */
export type Beam = { x1: number; y1: number; x2: number; y2: number; level: number; down: boolean };

/** One tie arc between two noteheads at `y`, or one half of a tie broken by a line break. */
export type TieArc = { id: string; x1: number; x2: number; y: number; above: boolean };

/**
 * One slur on one line (a slur across a line break has one per line): a cubic from (x1, y1) to
 * (x2, y2) with both control points `bulge` away from that line, negative upward. `bars` are the
 * whole slur's first and last bar numbers.
 */
export type SlurArc = {
  id: string;
  slurId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bulge: number;
  bars: [number, number];
};

/** Beat-to-x anchor inside a bar, for the playhead. */
export type BeatColumn = { beat: number; x: number };

export type BarScene = {
  id: string;
  /** 1-based bar number. */
  number: number;
  /** Left barline (start of the bar's space). */
  x: number;
  /** Right barline. */
  endX: number;
  width: number;
  meter: Meter;
  /** Centre of the time signature when one is drawn for this bar (header or mid-line change). */
  meterX: number | null;
  /** Absolute start beat of the bar. */
  beat: number;
  capacity: number;
  /** X of the bar's first event. */
  notesX: number;
  columns: BeatColumn[];
  /** X of the thick line of a start-repeat sign, or null. */
  repeatStartX: number | null;
  /** Total passes when a repeat ends at this bar. */
  repeatEnd: number | null;
  tempo?: number;
  /** Last bar of the score: drawn with a final barline. */
  final: boolean;
  style: "slashes" | "repeat" | null;
  /** X of each rhythm slash in a slash bar. */
  slashXs: number[];
  section: string | null;
  /** Navigation marks on this bar, in the order they were added. */
  marks: { id: string; kind: MarkKind }[];
  /** IDs of repeats starting or ending here, so their signs can be selected. */
  repeatStartId: string | null;
  repeatEndId: string | null;
};

/** A chord symbol placed in the chord row. */
export type SceneChord = { id: string; x: number; text: string };

export type KeyAccidentalMark = { x: number; y: number; alter: -1 | 1 };

export type SceneLabel = {
  id: string;
  annotationId: string;
  x: number;
  y: number;
  text: string;
  kind: "text" | "dynamic";
};

export type System = {
  /** Y of the top staff line. */
  top: number;
  /** Index of the first measure on this system. */
  firstMeasure: number;
  /** Where the staff lines end: the last barline. */
  endX: number;
  clef: Clef;
  keySignature: KeyAccidentalMark[];
  bars: BarScene[];
  events: EngravedEvent[];
  beams: Beam[];
  beamedIds: string[];
  ties: TieArc[];
  slurs: SlurArc[];
  labels: SceneLabel[];
  chords: SceneChord[];
  /** Baselines of the rows above the staff. */
  chordY: number;
  markY: number;
};

export type Scene = { width: number; height: number; systems: System[] };

export const SCENE_WIDTH = 900;
/** Distance between staff lines. */
export const STAFF_GAP = 12;
/** Distance between adjacent staff positions (a line and the next space). */
export const STAFF_STEP = STAFF_GAP / 2;
export const STAFF_HEIGHT = STAFF_GAP * 4;
export const STAFF_LEFT = 35;
/** Right edge available to a justified system. */
export const LINE_END = 846;
export const SYSTEM_HEIGHT = 230;
export const STEM_LENGTH = STAFF_GAP * 3.5;
export const STEM_OFFSET = 6;

/** Staff positions are counted in steps above the bottom line; the middle line is 4. */
export const MIDDLE_LINE = 4;

/** X of an event's stem: right of the notehead when up, left when down. */
export const stemX = (item: Pick<EngravedEvent, "x" | "stemDown">) =>
  item.x + (item.stemDown ? -STEM_OFFSET : STEM_OFFSET);

/** Y of a staff position counted in steps above the bottom line. */
export const positionY = (systemTop: number, position: number) => systemTop + STAFF_HEIGHT - position * STAFF_STEP;

/** Maps a beat inside a bar to x, interpolating between event onsets. */
export function beatX(bar: BarScene, beat: number): number {
  const { columns } = bar;
  for (let i = 0; i < columns.length - 1; i++) {
    const from = columns[i];
    const to = columns[i + 1];
    if (beat >= from.beat && beat <= to.beat) {
      return from.x + ((beat - from.beat) / (to.beat - from.beat || 1)) * (to.x - from.x);
    }
  }
  return beat < columns[0].beat ? columns[0].x : columns[columns.length - 1].x;
}
