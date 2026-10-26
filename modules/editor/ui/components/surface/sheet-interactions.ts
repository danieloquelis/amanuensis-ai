import type { KeyboardEvent, MouseEvent } from "react";
import type { Step } from "@/modules/score";
import type { SheetItem } from "../../../application/notation-edits";
import type { CommitEdit } from "../../hooks/use-score-editor";
import type { useSheetGestures } from "../../hooks/use-sheet-gestures";

export type SheetMenuTarget = {
  kind: "note" | "bar" | "meter" | "annotation" | "chord" | "section";
  id: string;
  x: number;
  y: number;
};

/** Callbacks shared by every interactive element on the sheet. */
export type SheetInteractions = {
  interactive: boolean;
  select: (id: string | null) => void;
  selectedBarId: string | null;
  selectBar: (measureId: string | null) => void;
  deleteBar: (measureId: string) => void;
  selectedItem: SheetItem | null;
  selectItem: (item: SheetItem | null) => void;
  deleteItem: (item: SheetItem) => void;
  commit: CommitEdit;
  stepPitch: (eventId: string, steps: number) => void;
  removeEvent: (eventId: string) => void;
  enterLetter: (eventId: string, step: Step) => void;
  toggleRest: (eventId: string) => void;
  openMenu: (kind: SheetMenuTarget["kind"], id: string, x: number, y: number) => void;
  gestures: ReturnType<typeof useSheetGestures>;
};

/** A–G (either case, no modifiers) enters that note. */
export const noteLetterOf = (event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }) =>
  /^[a-g]$/i.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey
    ? (event.key.toUpperCase() as Step)
    : null;

/** Keys that open an element's menu from the keyboard. */
export const isMenuKey = (event: { key: string; shiftKey: boolean }) =>
  event.key === "Enter" || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");

/**
 * Props that make any sheet item selectable: click selects it, Delete/Backspace removes it,
 * Escape deselects. Spread onto the item's root SVG element.
 */
export function selectableItem(
  interactions: SheetInteractions,
  item: SheetItem,
  label: string,
  classes: { selected: string; base?: string },
) {
  const selected = interactions.selectedItem?.kind === item.kind && interactions.selectedItem.id === item.id;
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    "aria-pressed": selected,
    className: [classes.base, selected && classes.selected].filter(Boolean).join(" ") || undefined,
    onClick: (e: MouseEvent<SVGElement>) => {
      interactions.selectItem(item);
      e.currentTarget.focus();
    },
    onKeyDown: (e: KeyboardEvent<SVGElement>) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        interactions.deleteItem(item);
      }
      if (e.key === "Escape") interactions.selectItem(null);
    },
  };
}
