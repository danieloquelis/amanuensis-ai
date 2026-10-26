import type { CommitEdit } from "../../hooks/use-score-editor";
import type { useSheetGestures } from "../../hooks/use-sheet-gestures";

export type SheetMenuTarget = { kind: "note" | "bar" | "annotation"; id: string; x: number; y: number };

/** Callbacks shared by every interactive element on the sheet. */
export type SheetInteractions = {
  interactive: boolean;
  select: (id: string | null) => void;
  commit: CommitEdit;
  stepPitch: (eventId: string, steps: number) => void;
  removeEvent: (eventId: string) => void;
  openMenu: (kind: SheetMenuTarget["kind"], id: string, x: number, y: number) => void;
  gestures: ReturnType<typeof useSheetGestures>;
};

/** Keys that open an element's menu from the keyboard. */
export const isMenuKey = (event: { key: string; shiftKey: boolean }) =>
  event.key === "Enter" || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
