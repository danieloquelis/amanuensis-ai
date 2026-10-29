// Public API of the engraving module (framework-free). React glyphs live in "./ui".
export { layoutScore } from "./domain/layout-score";
export {
  beatX,
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
  type System,
  type TieArc,
} from "./domain/scene";
