import type { Clef, MarkKind, Meter, Pitch, ScoreEvent } from "@/modules/score";

/** One placed note, rest or space. Coordinates are SVG scene units (12 per staff space). */
export type EngravedEvent = {
  event: ScoreEvent;
  /** Its voice on the staff, from 1 (the main line). */
  voice: number;
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
  /** How much further left the accidental sits, beside another one in the same column. */
  accidentalShift?: number;
  /**
   * Where its ties, slurs and articulations go when voices share the bar: the upper voice's above,
   * the lower voice's below (on the stem side). Absent with one voice, where they follow the stems.
   */
  curveSide?: "above" | "below";
  /** Horizontal ink extent, including accidental, dot and flag. Used for collision checks. */
  left: number;
  right: number;
  /** The bar's whole-bar rest behind a slash or repeat display: selectable, not drawn. */
  hidden: boolean;
  /** The note sounds outside its instrument's range: drawn in the warning colour. */
  outOfRange?: true;
  /** A chord's heads, lowest first, each with its offset across the stem; absent for a single note. */
  heads?: { y: number; dx: number; accidental: number | null; accidentalShift: number }[];
  /** A chord's highest head: an up-stem and its beam start from here. */
  chordTop?: number;
  /** The pitches it sounds, lowest first, when the staff shows a transposing part as written (the event's are written). */
  sounds?: Pitch[];
  /** Its staff in the system, counted from 0; absent on the first. */
  staff?: number;
};

/** A beam segment. `y1`/`y2` are the stem tips (outer edge); thickness grows toward the noteheads. */
export type Beam = { x1: number; y1: number; x2: number; y2: number; level: number; down: boolean };

/**
 * A triplet's "3": centred between `x1` and `x2` at `y`, on its stem side (`above`), with a
 * bracket across that span when the group is not beamed on its own.
 */
export type TupletMark = {
  id: string;
  x1: number;
  x2: number;
  y: number;
  above: boolean;
  bracket: boolean;
  /** Its staff in the system, counted from 0; absent on the first. */
  staff?: number;
};

/** Half the height of a triplet's "3" and of its bracket's hooks: how far a mark reaches either side of its `y`. */
export const TUPLET_HALF_HEIGHT = 7;

/** How far a triplet mark reaches up and down, for whatever must keep clear of it. */
export const tupletInk = (mark: TupletMark) => ({
  top: mark.y - TUPLET_HALF_HEIGHT,
  bottom: mark.y + TUPLET_HALF_HEIGHT,
});

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
  /** A dynamic's staff, counted from 0; absent on the first. */
  staff?: number;
};

/** One staff of a system with several: its header, and on a part's first staff the part's name and barline reach. */
export type StaffScene = {
  staffId: string;
  top: number;
  clef: Clef;
  keySignature: KeyAccidentalMark[];
  /** Barlines run from this staff down to here: the bottom of the part's last staff. Absent below a part's first staff. */
  barlineEnd?: number;
  /** A brace joins the part's staves (a grand staff). */
  brace?: boolean;
  name?: { text: string; y: number };
};

export type System = {
  /** Y of the top staff line. */
  top: number;
  /** With more than one staff, every staff, top down (the first is `top`, `clef`, `keySignature`). */
  staves?: StaffScene[];
  /** How far right of the usual start the staves begin, leaving room for part names. */
  indent?: number;
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
  tuplets: TupletMark[];
  ties: TieArc[];
  slurs: SlurArc[];
  labels: SceneLabel[];
  chords: SceneChord[];
  /** Baselines of the rows above the staff. */
  chordY: number;
  markY: number;
};

export type Scene = { width: number; height: number; systems: System[] };

/**
 * The page's width, in the units everything is drawn in: an A4 page's printable width (about
 * 180 mm) with a standard 7 mm staff (`STAFF_HEIGHT`), so a line holds what a printed part would.
 */
export const SCENE_WIDTH = 1240;
/** Room kept free at the right of a line. */
const RIGHT_MARGIN = 54;
/** Distance between staff lines. */
export const STAFF_GAP = 12;
/** Distance between adjacent staff positions (a line and the next space). */
export const STAFF_STEP = STAFF_GAP / 2;
export const STAFF_HEIGHT = STAFF_GAP * 4;
export const STAFF_LEFT = 35;
/** Right edge available to a justified system. */
export const LINE_END = SCENE_WIDTH - RIGHT_MARGIN;
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
