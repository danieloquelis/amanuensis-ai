// Public API of the engraving module (framework-free). React glyphs live in "./ui".
export { layoutScore, type LayoutOptions } from "./domain/layout-score";
export { CLEF_NAMES } from "./domain/clefs";
export {
  beatX,
  LINE_END,
  SCENE_WIDTH,
  STAFF_GAP,
  STAFF_LEFT,
  stemX,
  SYSTEM_HEIGHT,
  type BarScene,
  type Beam,
  type BeatColumn,
  type EngravedEvent,
  type KeyAccidentalMark,
  type Scene,
  type SceneLabel,
  type SlurArc,
  type StaffScene,
  type System,
  type TieArc,
  type TupletMark,
} from "./domain/scene";
export { nameRight, staffOf, staffTop, stavesLeft, systemBottom } from "./domain/staff-layout";
export { barlineStaves, barStaves, closesWithFinalBarline, placeBarMarks, type BarStaff } from "./domain/bar-furniture";
