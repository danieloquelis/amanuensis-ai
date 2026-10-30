import type { KeyboardEvent, MouseEvent } from "react";
import type { Step } from "@/modules/score";
import type { SheetItem } from "../../../application/notation-edits";
import { refKey, type PickMode, type SheetRef } from "../../../application/sheet-selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import type { useSheetGestures } from "../../hooks/use-sheet-gestures";
import type { useSlurDrag } from "../../hooks/use-slur-drag";

export type SheetMenuTarget = {
  kind: "meter" | "annotation" | "chord" | "section";
  id: string;
  x: number;
  y: number;
};

/** Callbacks shared by every interactive element on the sheet. */
export type SheetInteractions = {
  interactive: boolean;
  select: (id: string | null, head?: number) => void;
  selectedBarId: string | null;
  /** Selects a bar: in one instrument's lane with `staffId`, else the whole bar. */
  selectBar: (measureId: string | null, staffId?: string) => void;
  deleteBar: (measureId: string, staffId?: string) => void;
  selectedItem: SheetItem | null;
  selectItem: (item: SheetItem | null) => void;
  deleteItem: (item: SheetItem) => void;
  commit: CommitEdit;
  stepPitch: (eventId: string, steps: number) => void;
  removeEvent: (eventId: string) => void;
  /** A–G on a note or rest; with Shift (`addToChord`) the note joins it on its stem. */
  enterLetter: (eventId: string, step: Step, addToChord: boolean) => void;
  toggleRest: (eventId: string) => void;
  /** S: slurs the picked phrase, or this note to the next. */
  slur: (eventId: string) => void;
  /** Whether an item is part of the selection (one of several, or the only one). */
  isPicked: (ref: SheetRef) => boolean;
  /** The head picked on a note's stem, or null when the whole stem (or nothing) is picked. */
  pickedHead: (eventId: string) => number | null;
  /** Several things are picked: single-item quick actions stay out of the way. */
  multiple: boolean;
  pick: (ref: SheetRef, mode: PickMode) => void;
  /** Focus moved to a note: it is selected unless it is already part of the selection. */
  focusEvent: (eventId: string) => void;
  openMenu: (kind: SheetMenuTarget["kind"], id: string, x: number, y: number) => void;
  gestures: ReturnType<typeof useSheetGestures>;
  slurGestures: ReturnType<typeof useSlurDrag>;
};

/** Shift-click extends a range; ⌘-click (Ctrl on Windows) adds or removes one item. */
export const pickModeOf = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): PickMode | null =>
  event.shiftKey ? "range" : event.metaKey || event.ctrlKey ? "toggle" : null;

/** Marks a sheet element with what it shows, so overlays can find it on screen. */
export const sheetRefAttribute = (ref: SheetRef) => ({ "data-sheet-ref": refKey(ref) });

/** A–G (either case, no modifiers) enters that note. */
export const noteLetterOf = (event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }) =>
  /^[a-g]$/i.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey
    ? (event.key.toUpperCase() as Step)
    : null;

/** S (no modifiers) slurs, as in notation editors. */
export const isSlurKey = (event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }) =>
  /^s$/i.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey;

/** Keys that open an element's menu from the keyboard. */
export const isMenuKey = (event: { key: string; shiftKey: boolean }) =>
  event.key === "Enter" || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");

/**
 * Props that make any sheet item selectable: click selects it (Shift/⌘ adds it to the selection),
 * Delete/Backspace removes it, Escape deselects. Spread onto the item's root SVG element.
 */
export function selectableItem(
  interactions: SheetInteractions,
  item: SheetItem,
  label: string,
  classes: { selected: string; base?: string },
) {
  const selected = interactions.isPicked(item);
  return {
    ...sheetRefAttribute(item),
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    "aria-pressed": selected,
    className: [classes.base, selected && classes.selected].filter(Boolean).join(" ") || undefined,
    onClick: (e: MouseEvent<SVGElement>) => {
      const mode = pickModeOf(e);
      if (mode) return interactions.pick(item, mode);
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
