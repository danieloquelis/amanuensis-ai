// Public API of the editor module (framework-free). React components and hooks live in "./ui".
export { checkOperation } from "./application/operation-check";
export { findSelection, selectionAfterEdit, type Selection } from "./application/selection";
export { letterNoteEdit, toggleRestOperation, type Edit } from "./application/note-edits";
export {
  playbackStart,
  rangeOfRefs,
  refExists,
  refName,
  sameRef,
  selectionName,
  toggleRef,
  type PickMode,
  type SheetRef,
} from "./application/sheet-selection";
