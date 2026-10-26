import type { Meter, ScoreEvent } from "@/modules/score";

/** One placed note, rest or space. Coordinates are SVG scene units. */
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
  /** Accidental to draw (-1, 0 for natural, 1), or null when the bar's state already implies it. */
  accidental: number | null;
};

export type Beam = { x1: number; x2: number; y: number; level: number };

export type BarScene = {
  id: string;
  /** 1-based bar number. */
  number: number;
  x: number;
  endX: number;
  meter: Meter;
  showMeter: boolean;
  /** Absolute start beat of the bar. */
  beat: number;
  capacity: number;
  /** X of the bar's first beat. */
  notesX: number;
  /** Scene units per quarter-note beat. */
  unit: number;
  repeatStart: boolean;
  /** Total passes when a repeat ends at this bar. */
  repeatEnd: number | null;
  tempo?: number;
};

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
  bars: BarScene[];
  events: EngravedEvent[];
  beams: Beam[];
  beamedIds: string[];
  labels: SceneLabel[];
};

export type Scene = { width: number; height: number; systems: System[] };

export const SCENE_WIDTH = 900;
/** Distance between staff lines. */
export const STAFF_GAP = 12;
/** Distance between adjacent staff positions (a line and the next space). */
export const STAFF_STEP = STAFF_GAP / 2;
export const STAFF_HEIGHT = STAFF_GAP * 4;
export const SYSTEM_HEIGHT = 230;
export const STAFF_LINES_X = { start: 35, end: 846 } as const;
export const STEM_LENGTH = 38;
export const STEM_OFFSET = 6;
export const DEFAULT_MEASURE_WIDTH = 364;
export const MEASURES_PER_SYSTEM = 2;

/** X of an event's stem: right of the notehead when up, left when down. */
export const stemX = (item: Pick<EngravedEvent, "x" | "stemDown">) =>
  item.x + (item.stemDown ? -STEM_OFFSET : STEM_OFFSET);

/** Y of a staff position counted in steps above the bottom line. */
export const positionY = (systemTop: number, position: number) => systemTop + STAFF_HEIGHT - position * STAFF_STEP;
