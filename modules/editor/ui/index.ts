// Public React API of the editor module.
export { BarActions } from "./components/selection/BarActions";
export { NoteActions } from "./components/selection/NoteActions";
export { RangeActions } from "./components/selection/RangeActions";
export { ScoreSurface } from "./components/surface/ScoreSurface";
export { MixerTool } from "./components/toolbar/MixerTool";
export { ScoreToolMenus } from "./components/toolbar/ScoreToolMenus";
export { useClipboardShortcuts } from "./hooks/use-clipboard-shortcuts";
export { useScoreEditor, type CommitEdit, type ScoreEditor } from "./hooks/use-score-editor";
export { useTurnPreview } from "./hooks/use-turn-preview";
