import type { SheetView, SheetViews } from "../application/sheet-view";

const viewKey = (id: string) => `amanuensis.view.${id}`;

/**
 * Where each song's sheet was left, in this browser's localStorage. A convenience: when storage
 * is unavailable, the sheet simply opens at the top.
 */
export const localSheetViews: SheetViews = {
  load(workspaceId) {
    try {
      const raw = localStorage.getItem(viewKey(workspaceId));
      const view = raw ? (JSON.parse(raw) as Partial<SheetView>) : null;
      return view && Number.isFinite(view.top) && Number.isFinite(view.left)
        ? { top: view.top!, left: view.left! }
        : null;
    } catch {
      return null;
    }
  },
  save(workspaceId, view) {
    try {
      localStorage.setItem(
        viewKey(workspaceId),
        JSON.stringify({ top: Math.round(view.top), left: Math.round(view.left) }),
      );
    } catch {
      // Not kept: the sheet will open at the top next time.
    }
  },
  remove(workspaceId) {
    try {
      localStorage.removeItem(viewKey(workspaceId));
    } catch {
      // Nothing to clean up.
    }
  },
};
