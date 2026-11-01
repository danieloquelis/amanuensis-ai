// Public API of the workspace module (framework-free). Screens and hooks live in "./ui".
export { editedAgo } from "./application/edited-ago";
export { holdFirstRequest, takeFirstRequest } from "./application/first-request";
export { PREVIEW_PARTS, previewScore } from "./application/preview-score";
export { followPlayhead, type Box, type SheetView, type SheetViews } from "./application/sheet-view";
export { openSongbook, removeSong, type Song, type SongStores } from "./application/songbook";
