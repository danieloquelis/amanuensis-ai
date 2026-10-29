// Public API of the editor module (framework-free). React components and hooks live in "./ui".
export { checkOperation } from "./application/operation-check";
export { sheetHeading } from "./application/sheet-view";
export { copyFromSelection, cutEdit, pasteBarsText, pasteEdit, type Clip } from "./application/clipboard";
export { hasSecondVoice, secondVoiceEdit } from "./application/voice-edits";
export { addToChordEdit, typedLetterEdit } from "./application/chord-edits";
export { findSelection, selectionAfterEdit, type Selection } from "./application/selection";
export { letterNoteEdit, toggleRestOperation, type Edit } from "./application/note-edits";
export {
  allHave,
  octaveEdit,
  phraseArticulationEdit,
  pickedEvents,
  slurEdit,
  slurKeyEdit,
  slurOver,
} from "./application/range-edits";
export {
  playbackStart,
  rangeOfRefs,
  refExists,
  refName,
  sameRef,
  selectionAnchors,
  selectionName,
  toggleRef,
  type PickMode,
  type SheetRef,
} from "./application/sheet-selection";
